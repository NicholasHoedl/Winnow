import { describe, expect, it } from "vitest"

import {
  buildGoalPlanMessages,
  buildImportMessages,
  buildRoutineMessages,
  buildSummaryMessages,
  finalizePlan,
  offsetLabel,
  planCounts,
  planWarnings,
  proposedQuota,
  resolveCategory,
  routineSpan,
  summaryReadiness,
  uncategorisedCount,
  type GoalPromptContext,
  summaryObservations,
} from "./service"
import type { GoalPlanPayload } from "./validation"

const TODAY = "2026-08-04"

const goal: GoalPromptContext = {
  title: "Learn 2000 Kanji",
  notes: null,
  targetDate: "2026-12-31",
  // No numeric target on the BASE fixture, deliberately: it keeps the exact-string prompt
  // tripwire below asserting the same string it always did, so the tests that gained a
  // numeric goal had to say so explicitly rather than shifting it under everything.
  targetValue: null,
  currentValue: null,
  unit: null,
  existingMilestones: [],
  today: TODAY,
}

/** A goal measured numerically — what the rate check needs to have anything to say. */
const measuredGoal = {
  targetDate: "2026-12-31",
  targetValue: 2000,
  currentValue: 0,
  unit: "kanji",
}

/** A session habit in the shape the payload now carries. */
const sessions = (
  title: string,
  period: "day" | "week" | "month",
  targetCount: number,
) => ({ title, period, targetCount, targetAmount: null, unit: null })

/** A measured one — "20 kanji a day". */
const measured = (
  title: string,
  period: "day" | "week" | "month",
  targetAmount: number,
  unit = "kanji",
) => ({ title, period, targetCount: 1, targetAmount, unit })

const plan = (over: Partial<GoalPlanPayload> = {}): GoalPlanPayload => ({
  milestones: [{ title: "Radicals", dueDate: "2026-09-30" }],
  // A habit by default, so the base fixture does not trip the `no-habits` warning in every
  // unrelated case — the tests that care about it override this to an empty array.
  habits: [sessions("Review the deck", "day", 1)],
  setupTasks: [],
  ...over,
})

describe("buildGoalPlanMessages", () => {
  // Asserted as an exact string, not a set of `toContain`s. This is ADR-0011's tripwire:
  // any field that starts reaching the prompt — because someone spread a row, or widened
  // GoalPromptContext — changes this string and fails here, rather than quietly travelling
  // to a third party. With the notes module gone this is the ONLY mechanical enforcement
  // the boundary has left, so it is worth the brittleness it costs.
  it("sends exactly the named fields and nothing else", () => {
    const [system, user] = buildGoalPlanMessages(goal)
    expect(system.role).toBe("system")
    expect(user).toEqual({
      role: "user",
      content: [
        "Goal: Learn 2000 Kanji",
        "Today is 2026-08-04.",
        "Target date: 2026-12-31.",
      ].join("\n"),
    })
  })

  it("includes the goal's own description when it has one", () => {
    const [, user] = buildGoalPlanMessages({
      ...goal,
      notes: "30 minutes daily, no manga",
    })
    expect(user.content).toContain("30 minutes daily, no manga")
  })

  it("names existing milestones so they are not proposed again", () => {
    const [, user] = buildGoalPlanMessages({
      ...goal,
      existingMilestones: ["Radicals", "First 500"],
    })
    expect(user.content).toContain("Radicals; First 500")
  })

  it("says so when there is no target date, rather than omitting it silently", () => {
    const [, user] = buildGoalPlanMessages({ ...goal, targetDate: null })
    expect(user.content).toContain("No target date has been set")
  })

  it("sends the previous plan when refining, not a conversation", () => {
    const previous = plan()
    const [, user] = buildGoalPlanMessages(goal, "make it shorter", previous)
    expect(user.content).toContain("Revise this existing plan")
    expect(user.content).toContain("make it shorter")
    expect(user.content).toContain(JSON.stringify(previous))
  })

  it("ignores an instruction with no plan to revise", () => {
    const [, user] = buildGoalPlanMessages(goal, "make it shorter")
    expect(user.content).not.toContain("Revise this existing plan")
  })
})

describe("planWarnings", () => {
  it("says nothing about a well-spaced plan", () => {
    expect(planWarnings(plan(), goal, TODAY)).toEqual([])
  })

  it("flags a date in the past", () => {
    const result = planWarnings(
      plan({ milestones: [{ title: "Radicals", dueDate: "2026-07-01" }] }),
      goal,
      TODAY,
    )
    expect(result).toEqual([
      { on: "milestone", index: 0, kind: "past", message: "Dated in the past" },
    ])
  })

  it("flags a date past the goal's target", () => {
    const result = planWarnings(
      plan({ milestones: [{ title: "All 2000", dueDate: "2027-02-01" }] }),
      goal,
      TODAY,
    )
    expect(result[0].kind).toBe("after-target")
  })

  // The case from the mockup: inside the deadline, but only just.
  it("flags cutting it fine, and counts the days", () => {
    const result = planWarnings(
      plan({ milestones: [{ title: "All 2000", dueDate: "2026-12-28" }] }),
      goal,
      TODAY,
    )
    expect(result[0]).toMatchObject({
      kind: "tight",
      message: "3 days before your target date",
    })
  })

  it("reads the target date itself as on it, not before it", () => {
    const result = planWarnings(
      plan({ milestones: [{ title: "All 2000", dueDate: "2026-12-31" }] }),
      goal,
      TODAY,
    )
    expect(result[0].message).toBe("On your target date")
  })

  it("singularises one day", () => {
    const result = planWarnings(
      plan({ milestones: [{ title: "All 2000", dueDate: "2026-12-30" }] }),
      goal,
      TODAY,
    )
    expect(result[0].message).toBe("1 day before your target date")
  })

  /**
   * The bug this pair exists to stop coming back.
   *
   * A goal whose milestones are already complete makes the model answer with an EMPTY
   * milestone list — correctly, because the prompt lists what exists precisely so it does
   * not propose duplicates. `milestones` used to be `.min(1)`, so that correct answer was
   * rejected by the Zod parse and reached the user as a bare "the provider answered with
   * something this app couldn't read as a plan", with no way forward but regenerating and
   * getting the same result. Observed against a real goal with five milestones.
   */
  it("flags a plan with no milestones instead of the schema rejecting it", () => {
    const result = planWarnings(plan({ milestones: [] }), goal, TODAY)
    expect(result).toContainEqual({
      on: "plan",
      index: 0,
      kind: "no-milestones",
      message: "No milestones — nothing here marks progress toward the goal",
    })
  })

  it("does not flag missing milestones when some are proposed", () => {
    const result = planWarnings(plan(), goal, TODAY)
    expect(result.some((w) => w.kind === "no-milestones")).toBe(false)
  })

  it("flags a milestone dated before the one it follows", () => {
    const result = planWarnings(
      plan({
        milestones: [
          { title: "First", dueDate: "2026-10-01" },
          { title: "Second", dueDate: "2026-09-01" },
        ],
      }),
      goal,
      TODAY,
    )
    expect(result).toContainEqual({
      on: "milestone",
      index: 1,
      kind: "out-of-order",
      message: "Dated before the milestone above it",
    })
  })

  // A goal with no deadline cannot be late for one. Past is still past.
  it("only checks the past when there is no target date", () => {
    const undated = { targetDate: null }
    expect(
      planWarnings(
        plan({ milestones: [{ title: "Someday", dueDate: "2030-01-01" }] }),
        undated,
        TODAY,
      ),
    ).toEqual([])
    expect(
      planWarnings(
        plan({ milestones: [{ title: "Missed", dueDate: "2020-01-01" }] }),
        undated,
        TODAY,
      ),
    ).toHaveLength(1)
  })

  it("checks setup tasks as well as milestones", () => {
    const result = planWarnings(
      plan({ setupTasks: [{ title: "Buy a book", dueDate: "2026-07-01" }] }),
      goal,
      TODAY,
    )
    expect(result).toEqual([
      { on: "setupTask", index: 0, kind: "past", message: "Dated in the past" },
    ])
  })

  // T12c. The app judging the plan's SHAPE, not just its dates — a ladder with nothing
  // climbing it is the exact failure this tranche exists to prevent, and the model is never
  // asked to grade its own work.
  it("flags a plan with no recurring practice at all", () => {
    const result = planWarnings(plan({ habits: [] }), goal, TODAY)
    expect(result).toEqual([
      {
        on: "plan",
        index: 0,
        kind: "no-habits",
        message:
          "No recurring practice — nothing here builds toward the milestones",
      },
    ])
  })

  it("says nothing about habits when there are some", () => {
    // Habits carry no dates, so there is nothing here for the date checks to judge.
    expect(
      planWarnings(
        plan({
          habits: [
            sessions("Attend class", "week", 3),
            sessions("Drill at home", "week", 2),
          ],
        }),
        goal,
        TODAY,
      ),
    ).toEqual([])
  })
})

describe("planCounts", () => {
  it("counts what Apply will create", () => {
    expect(
      planCounts(
        plan({
          milestones: [
            { title: "a", dueDate: "2026-09-01" },
            { title: "b", dueDate: "2026-10-01" },
          ],
          habits: [sessions("h", "week", 3)],
          setupTasks: [{ title: "t", dueDate: "2026-09-01" }],
        }),
      ),
    ).toEqual({ milestones: 2, habits: 1, setupTasks: 1 })
  })
})

/**
 * This suite got much duller in T12c, which is the point worth recording.
 *
 * Tasks used to carry a `milestoneIndex` — a POSITION in the milestones array — so dropping
 * a middle milestone shifted every index after it and a task naming the old position moved
 * parent silently. Half these cases existed to pin that renumbering down. T12c retired the
 * index: habits and setup tasks attach to the goal, which is where tasks always attached in
 * the data model anyway. Nothing points at a position any more, so there is nothing to
 * renumber and nothing left to get wrong.
 */
describe("finalizePlan", () => {
  const full: GoalPlanPayload = {
    milestones: [
      { title: "A", dueDate: "2026-09-01" },
      { title: "B", dueDate: "2026-10-01" },
      { title: "C", dueDate: "2026-11-01" },
    ],
    habits: [
      sessions("Practice daily", "day", 1),
      sessions("Attend class", "week", 3),
    ],
    setupTasks: [{ title: "Buy the book", dueDate: "2026-08-20" }],
  }
  const none = {
    milestones: new Set<number>(),
    habits: new Set<number>(),
    setupTasks: new Set<number>(),
  }

  it("returns everything when nothing is excluded", () => {
    expect(finalizePlan(full, none)).toEqual(full)
  })

  // The three lists are independent now — dropping a milestone takes nothing with it,
  // because nothing hangs off it.
  it("drops a milestone without touching the practice", () => {
    const result = finalizePlan(full, { ...none, milestones: new Set([1]) })
    expect(result.milestones.map((m) => m.title)).toEqual(["A", "C"])
    expect(result.habits).toHaveLength(2)
    expect(result.setupTasks).toHaveLength(1)
  })

  it("drops one habit and leaves the rest of the plan alone", () => {
    const result = finalizePlan(full, { ...none, habits: new Set([0]) })
    expect(result.habits.map((h) => h.title)).toEqual(["Attend class"])
    expect(result.milestones).toHaveLength(3)
  })

  it("drops a setup task on its own", () => {
    const result = finalizePlan(full, { ...none, setupTasks: new Set([0]) })
    expect(result.setupTasks).toEqual([])
    expect(result.milestones).toHaveLength(3)
    expect(result.habits).toHaveLength(2)
  })

  it("survives excluding everything", () => {
    expect(
      finalizePlan(full, {
        milestones: new Set([0, 1, 2]),
        habits: new Set([0, 1]),
        setupTasks: new Set([0]),
      }),
    ).toEqual({ milestones: [], habits: [], setupTasks: [] })
  })
})

describe("buildRoutineMessages", () => {
  // Same tripwire as the goal prompt: an exact string, so anything that starts reaching
  // this prompt fails here rather than travelling to a provider unnoticed. A routine is
  // designed from a description, so NONE of the user's data belongs in it.
  it("sends the brief and nothing else", () => {
    const [system, user] = buildRoutineMessages("a morning routine before work")
    expect(system.role).toBe("system")
    expect(user).toEqual({
      role: "user",
      content: "Design a routine for: a morning routine before work",
    })
  })

  it("sends the previous routine when refining", () => {
    const previous = {
      name: "Morning",
      description: "before work",
      items: [
        { title: "Coffee", dueOffsetDays: 0, priority: "medium" as const },
      ],
    }
    const [, user] = buildRoutineMessages("morning", "add a walk", previous)
    expect(user.content).toContain("Revise this existing routine")
    expect(user.content).toContain("add a walk")
    expect(user.content).toContain(JSON.stringify(previous))
  })

  it("ignores an instruction with no routine to revise", () => {
    const [, user] = buildRoutineMessages("morning", "add a walk")
    expect(user.content).not.toContain("Revise this existing routine")
  })
})

describe("offsetLabel", () => {
  // The three cases are genuinely different and the UI must not collapse them: null is
  // "no due date", 0 is "the day you run it", negative is preparation beforehand.
  it("keeps no-date and day-zero apart", () => {
    expect(offsetLabel(null)).toBe("No date")
    expect(offsetLabel(0)).toBe("On the day")
  })

  it("reads negatives as preparation", () => {
    expect(offsetLabel(-7)).toBe("7 days before")
    expect(offsetLabel(-1)).toBe("1 day before")
  })

  it("reads positives as follow-up", () => {
    expect(offsetLabel(3)).toBe("3 days after")
    expect(offsetLabel(1)).toBe("1 day after")
  })
})

describe("routineSpan", () => {
  const routine = (offsets: (number | null)[]) => ({
    name: "R",
    description: "",
    items: offsets.map((dueOffsetDays, i) => ({
      title: `item ${i}`,
      dueOffsetDays,
      priority: "medium" as const,
    })),
  })

  it("says so when nothing is dated", () => {
    expect(routineSpan(routine([null, null]))).toBe("no dates")
  })

  it("collapses a single-day routine to one label", () => {
    expect(routineSpan(routine([0, 0, null]))).toBe("on the day")
  })

  it("spans from the earliest to the latest, ignoring undated items", () => {
    expect(routineSpan(routine([-7, null, 2]))).toBe(
      "7 days before to 2 days after",
    )
  })
})

describe("summaryReadiness", () => {
  const nothing = {
    tasksCompleted: 0,
    daysLogged: 0,
    moneyMoved: false,
    goalMovement: 0,
  }

  // The gate exists because a model will not say "there isn't much here" — given three
  // data points it writes a confident paragraph indistinguishable from a grounded one.
  // So the app refuses locally, before spending a paid call.
  it("refuses a week with nothing in it, and says why", () => {
    const result = summaryReadiness(nothing)
    expect(result.ready).toBe(false)
    expect(result.ready === false && result.reason).toContain("/review")
  })

  it("refuses a week with only a token amount of activity", () => {
    expect(
      summaryReadiness({ ...nothing, tasksCompleted: 2, daysLogged: 2 }).ready,
    ).toBe(false)
  })

  // Any single real signal is enough — this guards against an empty week, it does not
  // grade a full one.
  it("accepts on tasks alone", () => {
    expect(summaryReadiness({ ...nothing, tasksCompleted: 3 }).ready).toBe(true)
  })

  it("accepts on meals alone", () => {
    expect(summaryReadiness({ ...nothing, daysLogged: 3 }).ready).toBe(true)
  })

  it("accepts on money alone", () => {
    expect(summaryReadiness({ ...nothing, moneyMoved: true }).ready).toBe(true)
  })

  it("accepts on goal movement alone", () => {
    expect(summaryReadiness({ ...nothing, goalMovement: 1 }).ready).toBe(true)
  })
})

describe("buildSummaryMessages", () => {
  const week = {
    weekStart: "2026-07-27",
    weekEnd: "2026-08-02",
    tasksCompleted: 9,
    busiestDay: "2026-07-29",
    taskTitles: ["Call the dentist", "Fix the tap"],
    taskOverflow: 7,
    daysLogged: 5,
    daysWithTarget: 5,
    daysOnTarget: 3,
    spent: "$412.30",
    earned: "$0.00",
    goalMovement: ["Chapter one · Write the book"],
    // A week already OVER by default, which is the premise every case below was written
    // under — "5 of 7 days logged" only reads correctly for a complete week.
    today: "2026-08-10",
    progress: { elapsed: 7, total: 7, remaining: 0 },
  }

  // Money arrives pre-formatted. The app did that arithmetic with `formatCents`; handing
  // a model integer cents and a currency code invites it to divide by a hundred badly.
  it("sends figures already computed, never raw amounts", () => {
    const [, user] = buildSummaryMessages(week)
    expect(user.content).toContain("$412.30 spent")
    expect(user.content).not.toContain("41230")
  })

  it("says how many task titles were left out rather than silently truncating", () => {
    const [, user] = buildSummaryMessages(week)
    expect(user.content).toContain("(and 7 more)")
  })

  it("omits the sections it has nothing for", () => {
    const [, user] = buildSummaryMessages({
      ...week,
      taskTitles: [],
      goalMovement: [],
    })
    expect(user.content).not.toContain("What was finished")
    expect(user.content).not.toContain("Progress toward goals")
  })

  // The week runs Monday to Sunday here, not Sunday to Saturday — `weekRange` builds it
  // from `weekStartsOn`, so naming the days off the week's own bounds is what carries the
  // setting into the prompt without this function ever reading the preference.
  it("names the days the week runs on, from its own bounds", () => {
    const [, user] = buildSummaryMessages(week)
    expect(user.content).toContain("runs Monday to Sunday")
  })

  // Reported from real use: on a Wednesday it said "3 of 7 days logged", which counts four
  // days as missed when three of them have not arrived.
  it("tells the model how much of the week has actually happened", () => {
    const [, user] = buildSummaryMessages({
      ...week,
      today: "2026-07-29",
      daysLogged: 2,
      progress: { elapsed: 3, total: 7, remaining: 4 },
    })
    expect(user.content).toContain("Today is Wednesday")
    expect(user.content).toContain("day 3 of 7")
    expect(user.content).toContain("4 still to come")
    // The denominator moves with it, and says that it is provisional.
    expect(user.content).toContain("Meals logged on 2 of 3 days so far")
  })

  it("says a finished week is finished, and drops the hedge", () => {
    const [, user] = buildSummaryMessages(week)
    expect(user.content).toContain("week is over")
    expect(user.content).not.toContain("so far")
    expect(user.content).not.toContain("still to come")
    expect(user.content).toContain("Meals logged on 5 of 7 days")
  })

  it("tells the model not to count days that have not happened as missed", () => {
    const [system] = buildSummaryMessages(week)
    expect(system.content).toContain("not missed days")
  })

  it("sends the previous summary when refining", () => {
    const previous = { headline: "A quiet week", observation1: "Not much." }
    const [, user] = buildSummaryMessages(week, "be blunter", previous)
    expect(user.content).toContain("Revise this existing summary")
    expect(user.content).toContain("be blunter")
  })
})

describe("summaryObservations", () => {
  // The schema stores four discrete fields because the provider would not fill an array
  // reliably; every reader still wants a list, and this is the only place that bridges the
  // two. A gap in the middle should not truncate the rest.
  it("collects the filled fields in order and drops the gaps", () => {
    expect(
      summaryObservations({
        headline: "h",
        observation1: "first",
        observation3: "third",
      }),
    ).toEqual(["first", "third"])
  })

  it("returns just the required one when nothing else is set", () => {
    expect(
      summaryObservations({ headline: "h", observation1: "only" }),
    ).toEqual(["only"])
  })
})

describe("resolveCategory", () => {
  const categories = [
    { id: "cat-groceries", name: "Groceries" },
    { id: "cat-rent", name: " Rent " },
  ]

  it("matches ignoring case and surrounding space", () => {
    expect(resolveCategory("groceries", categories)).toBe("cat-groceries")
    expect(resolveCategory("  RENT ", categories)).toBe("cat-rent")
  })

  // A wrong category is harder to notice than a missing one, so an unmatched guess is
  // never coerced onto the nearest thing.
  it("returns null rather than guessing at the nearest name", () => {
    expect(resolveCategory("Grocery", categories)).toBeNull()
    expect(resolveCategory("Utilities", categories)).toBeNull()
  })

  it("handles no category and an empty one alike", () => {
    expect(resolveCategory(null, categories)).toBeNull()
    expect(resolveCategory("   ", categories)).toBeNull()
  })
})

describe("uncategorisedCount", () => {
  const categories = [{ id: "cat-1", name: "Groceries" }]

  it("counts what Apply will leave without a category", () => {
    expect(
      uncategorisedCount(
        [
          { categoryName: "Groceries" },
          { categoryName: "Nope" },
          { categoryName: null },
        ],
        categories,
      ),
    ).toBe(2)
  })
})

describe("buildImportMessages", () => {
  it("offers only the user's own categories", () => {
    const [, user] = buildImportMessages("some csv", ["Groceries", "Rent"])
    expect(user.content).toContain("Groceries; Rent")
    expect(user.content).toContain("some csv")
  })

  it("says so when there are no categories, rather than sending an empty list", () => {
    const [, user] = buildImportMessages("some csv", [])
    expect(user.content).toContain("no categories yet")
  })

  it("sends the previous extraction when refining", () => {
    const previous = { rows: [{ payee: "Tesco" }] }
    const [, user] = buildImportMessages(
      "csv",
      ["Groceries"],
      "drop the refunds",
      previous,
    )
    expect(user.content).toContain("Revise this existing extraction")
    expect(user.content).toContain("drop the refunds")
  })
})

// ---------------------------------------------------------------------------------------
// The measured variant reaching the companion, and the rate check it unblocked. Named as
// unbuilt in IMPROVEMENT-PLAN since T12c, where it was waiting on a proposed habit being
// able to carry an amount at all.
// ---------------------------------------------------------------------------------------

describe("buildGoalPlanMessages — a numeric goal", () => {
  it("sends what is left, not just the total", () => {
    const [, user] = buildGoalPlanMessages({
      ...goal,
      targetValue: 2000,
      currentValue: 500,
      unit: "kanji",
    })
    expect(user.content).toContain("500 of 2000 kanji so far")
    expect(user.content).toContain("1500 kanji still to go")
  })

  it("asks for the goal's own unit, which is the only one the check can compare", () => {
    const [, user] = buildGoalPlanMessages({
      ...goal,
      targetValue: 2000,
      currentValue: null,
      unit: "kanji",
    })
    expect(user.content).toContain('use "kanji" as its unit')
  })

  it("says nothing numeric about a goal tracked by milestones alone", () => {
    const [, user] = buildGoalPlanMessages(goal)
    expect(user.content).not.toContain("Measured numerically")
  })
})

describe("proposedQuota", () => {
  it("reads an amount and a unit as measured", () => {
    expect(proposedQuota(measured("Learn", "day", 20))).toEqual({
      measured: true,
      amount: 20,
      unit: "kanji",
    })
  })

  it("reads a plain count as sessions", () => {
    expect(proposedQuota(sessions("Class", "week", 3))).toEqual({
      measured: false,
      amount: null,
      unit: null,
    })
  })

  // The half-states. A model can emit these because the both-or-neither rule CANNOT live in
  // the schema: it is converted with `z.toJSONSchema` and Zod refuses to convert a refinement
  // or a transform. Reading them as sessions keeps the plan visible and editable rather than
  // failing the whole payload as malformed.
  it("falls back to sessions when only one half was given", () => {
    for (const half of [
      { ...measured("Learn", "day", 20), unit: null },
      { ...measured("Learn", "day", 20), unit: "   " },
      { ...measured("Learn", "day", 20), targetAmount: null },
      { ...measured("Learn", "day", 20), targetAmount: 0 },
      { ...measured("Learn", "day", 20), targetAmount: Number.NaN },
    ]) {
      expect(proposedQuota(half).measured).toBe(false)
    }
  })

  it("trims a unit rather than carrying the whitespace into a reading", () => {
    expect(proposedQuota(measured("Learn", "day", 20, "  kanji ")).unit).toBe(
      "kanji",
    )
  })
})

describe("planWarnings — rate feasibility", () => {
  // 2026-08-04 to 2026-12-31 is 149 days. 2000 kanji needs ~13.4 a day.
  it("says nothing when the rate reaches the target", () => {
    const warnings = planWarnings(
      plan({ habits: [measured("Learn kanji", "day", 20)] }),
      measuredGoal,
      TODAY,
    )
    expect(warnings.filter((w) => w.kind === "rate-short")).toEqual([])
  })

  it("names the shortfall when it does not", () => {
    const warnings = planWarnings(
      plan({ habits: [measured("Learn kanji", "day", 5)] }),
      measuredGoal,
      TODAY,
    )
    const rate = warnings.find((w) => w.kind === "rate-short")
    expect(rate).toBeDefined()
    // 5 a day x 149 days = 745 of the 2000 needed.
    expect(rate!.message).toContain("745")
    expect(rate!.message).toContain("2000")
    expect(rate!.message).toContain("kanji")
  })

  // Two practices toward one goal really do add up, and judging either alone would report
  // a shortfall the plan does not have.
  it("sums every habit in the goal's unit", () => {
    const warnings = planWarnings(
      plan({
        habits: [
          measured("New kanji", "day", 7),
          measured("Review", "week", 49),
        ],
      }),
      measuredGoal,
      TODAY,
    )
    // 7/day + 7/day = 14/day, which clears 2000 in 149 days.
    expect(warnings.filter((w) => w.kind === "rate-short")).toEqual([])
  })

  it("counts what is LEFT, not the whole target", () => {
    const warnings = planWarnings(
      plan({ habits: [measured("Learn kanji", "day", 5)] }),
      { ...measuredGoal, currentValue: 1500 },
      TODAY,
    )
    // 745 covers the remaining 500 comfortably.
    expect(warnings.filter((w) => w.kind === "rate-short")).toEqual([])
  })

  // Every one of these is a reason to stay silent rather than guess.
  it("stays silent when there is nothing to compare", () => {
    const slow = [measured("Learn kanji", "day", 1)]
    const cases: [string, Parameters<typeof planWarnings>[1]][] = [
      ["no numeric target", { ...measuredGoal, targetValue: null }],
      ["no unit on the goal", { ...measuredGoal, unit: null }],
      ["no target date", { ...measuredGoal, targetDate: null }],
      ["target already reached", { ...measuredGoal, currentValue: 2000 }],
    ]
    for (const [why, g] of cases) {
      const warnings = planWarnings(plan({ habits: slow }), g, TODAY)
      expect(
        warnings.filter((w) => w.kind === "rate-short"),
        why,
      ).toEqual([])
    }
  })

  // `goals.unit` is free text and purely a display suffix — this app converts nothing and
  // must not start by inference. "30 minutes a day" toward 2000 kanji is not slow, it is
  // incomparable, and a number here would be a guess wearing a decimal point.
  it("stays silent when the units do not match", () => {
    const warnings = planWarnings(
      plan({ habits: [measured("Study", "day", 30, "minutes")] }),
      measuredGoal,
      TODAY,
    )
    expect(warnings.filter((w) => w.kind === "rate-short")).toEqual([])
  })

  it("matches units case- and space-insensitively", () => {
    const warnings = planWarnings(
      plan({ habits: [measured("Learn", "day", 1, " Kanji ")] }),
      measuredGoal,
      TODAY,
    )
    expect(warnings.some((w) => w.kind === "rate-short")).toBe(true)
  })

  it("ignores a session habit, which states no amount to check", () => {
    const warnings = planWarnings(
      plan({ habits: [sessions("Study", "day", 1)] }),
      measuredGoal,
      TODAY,
    )
    expect(warnings.filter((w) => w.kind === "rate-short")).toEqual([])
  })
})

describe("finalizePlan — half-stated habits", () => {
  const none = {
    milestones: new Set<number>(),
    habits: new Set<number>(),
    setupTasks: new Set<number>(),
  }

  // Reaching `createHabit` with an amount and no unit would be REJECTED by
  // `habitInputSchema`'s both-or-neither rule, failing the entire apply with "couldn't
  // create <title>". Resolving it here makes it the session habit it already reads as.
  it("resolves an amount with no unit to a session habit", () => {
    const result = finalizePlan(
      plan({ habits: [{ ...measured("Learn", "day", 20), unit: null }] }),
      none,
    )
    expect(result.habits[0]).toMatchObject({ targetAmount: null, unit: null })
  })

  it("leaves a properly stated measured habit alone", () => {
    const result = finalizePlan(
      plan({ habits: [measured("Learn", "day", 20)] }),
      none,
    )
    expect(result.habits[0]).toMatchObject({
      targetAmount: 20,
      unit: "kanji",
    })
  })
})

/**
 * A row you added and did not name is not a row you asked for.
 *
 * The plan panel can append an empty milestone or habit, so a blank title is now a normal
 * intermediate state rather than something only a broken model could produce. Dropping it
 * here is what keeps that safe: `planTitle` is `.min(1)`, so a blank one reaching the
 * server fails the whole apply with a generic error, and the live "Creates N…" counter
 * beside Apply would have been counting rows that were never going to be created.
 */
describe("finalizePlan — unnamed rows", () => {
  const none = {
    milestones: new Set<number>(),
    habits: new Set<number>(),
    setupTasks: new Set<number>(),
  }

  it("drops a milestone with no title", () => {
    const result = finalizePlan(
      {
        milestones: [
          { title: "Real", dueDate: "2026-09-01" },
          { title: "", dueDate: "2026-10-01" },
        ],
        habits: [],
        setupTasks: [],
      },
      none,
    )
    expect(result.milestones).toEqual([
      { title: "Real", dueDate: "2026-09-01" },
    ])
  })

  it("treats whitespace as no title", () => {
    const result = finalizePlan(
      {
        milestones: [{ title: "   ", dueDate: "2026-09-01" }],
        habits: [sessions("   ", "week", 3)],
        setupTasks: [{ title: " ", dueDate: "2026-08-20" }],
      },
      none,
    )
    expect(result.milestones).toEqual([])
    expect(result.habits).toEqual([])
    expect(result.setupTasks).toEqual([])
  })

  it("keeps a named row that sits after an unnamed one", () => {
    // Exclusions are keyed by INDEX, so the order things are dropped in matters. Filtering
    // by title after filtering by index would be reading the second filter's positions
    // against the first's — the renumbering bug this function's own note describes.
    const result = finalizePlan(
      {
        milestones: [
          { title: "", dueDate: "2026-09-01" },
          { title: "Kept", dueDate: "2026-10-01" },
          { title: "Excluded", dueDate: "2026-11-01" },
        ],
        habits: [],
        setupTasks: [],
      },
      { ...none, milestones: new Set([2]) },
    )
    expect(result.milestones).toEqual([
      { title: "Kept", dueDate: "2026-10-01" },
    ])
  })
})
