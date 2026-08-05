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
  resolveCategory,
  routineSpan,
  summaryReadiness,
  uncategorisedCount,
  type GoalPromptContext,
} from "./service"
import type { GoalPlanPayload } from "./validation"

const TODAY = "2026-08-04"

const goal: GoalPromptContext = {
  title: "Learn 2000 Kanji",
  notes: null,
  targetDate: "2026-12-31",
  existingMilestones: [],
  today: TODAY,
}

const plan = (over: Partial<GoalPlanPayload> = {}): GoalPlanPayload => ({
  milestones: [{ title: "Radicals", dueDate: "2026-09-30" }],
  tasks: [],
  ...over,
})

describe("buildGoalPlanMessages", () => {
  // Asserted as an exact string, not a set of `toContain`s. This is the ADR-0011 journal
  // boundary's tripwire: any field that starts reaching the prompt — because someone
  // spread a row, or widened GoalPromptContext — changes this string and fails here,
  // rather than quietly travelling to a third party.
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

  it("checks tasks as well as milestones", () => {
    const result = planWarnings(
      plan({
        tasks: [
          { title: "Buy a book", milestoneIndex: 0, dueDate: "2026-07-01" },
        ],
      }),
      goal,
      TODAY,
    )
    expect(result).toEqual([
      { on: "task", index: 0, kind: "past", message: "Dated in the past" },
    ])
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
          tasks: [{ title: "t", milestoneIndex: 0, dueDate: "2026-09-01" }],
        }),
      ),
    ).toEqual({ milestones: 2, tasks: 1 })
  })
})

describe("finalizePlan", () => {
  const full: GoalPlanPayload = {
    milestones: [
      { title: "A", dueDate: "2026-09-01" },
      { title: "B", dueDate: "2026-10-01" },
      { title: "C", dueDate: "2026-11-01" },
    ],
    tasks: [
      { title: "under A", milestoneIndex: 0, dueDate: "2026-08-20" },
      { title: "under B", milestoneIndex: 1, dueDate: "2026-09-20" },
      { title: "under C", milestoneIndex: 2, dueDate: "2026-10-20" },
    ],
  }
  const none = { milestones: new Set<number>(), tasks: new Set<number>() }

  it("returns everything when nothing is excluded", () => {
    expect(finalizePlan(full, none)).toEqual(full)
  })

  // The reason this function exists: dropping a middle milestone shifts every index
  // after it, and a task still naming the old position would silently move parent.
  it("renumbers tasks when a milestone in the middle is dropped", () => {
    const result = finalizePlan(full, {
      milestones: new Set([1]),
      tasks: new Set(),
    })
    expect(result.milestones.map((m) => m.title)).toEqual(["A", "C"])
    expect(result.tasks).toEqual([
      { title: "under A", milestoneIndex: 0, dueDate: "2026-08-20" },
      { title: "under C", milestoneIndex: 1, dueDate: "2026-10-20" },
    ])
  })

  it("drops a milestone's tasks with it", () => {
    const result = finalizePlan(full, {
      milestones: new Set([0]),
      tasks: new Set(),
    })
    expect(result.tasks.map((t) => t.title)).toEqual(["under B", "under C"])
  })

  it("drops an individually excluded task without touching its milestone", () => {
    const result = finalizePlan(full, {
      milestones: new Set(),
      tasks: new Set([1]),
    })
    expect(result.milestones).toHaveLength(3)
    expect(result.tasks.map((t) => t.title)).toEqual(["under A", "under C"])
  })

  it("survives excluding everything", () => {
    expect(
      finalizePlan(full, {
        milestones: new Set([0, 1, 2]),
        tasks: new Set([0, 1, 2]),
      }),
    ).toEqual({ milestones: [], tasks: [] })
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

  it("sends the previous summary when refining", () => {
    const previous = { headline: "A quiet week", observations: ["Not much."] }
    const [, user] = buildSummaryMessages(week, "be blunter", previous)
    expect(user.content).toContain("Revise this existing summary")
    expect(user.content).toContain("be blunter")
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
