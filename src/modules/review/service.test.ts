import { describe, expect, it } from "vitest"

import {
  type ReviewMacroDay,
  type ReviewTask,
  buildWeeklyReview,
  busiestDay,
  macroWeek,
  reviewHeadline,
} from "./service"

const task = (id: string, completedOn: string): ReviewTask => ({
  id,
  title: `Task ${id}`,
  completedOn,
})

const day = (over: Partial<ReviewMacroDay> = {}): ReviewMacroDay => ({
  date: "2026-07-20",
  calories: 2000,
  targetCalories: 2000,
  logged: true,
  ...over,
})

const NO_MONEY = { incomeCents: 0, expenseCents: 0, netCents: 0 }

const base = {
  weekStart: "2026-07-19",
  weekEnd: "2026-07-25",
  tasksCompleted: [],
  milestones: [],
  macroDays: [],
  money: NO_MONEY,
}

describe("macroWeek", () => {
  it("counts a day inside the tolerance as on target", () => {
    // 2100 against a 2000 target is 5% out — inside the 10% band.
    expect(macroWeek([day({ calories: 2100 })])).toEqual({
      daysLogged: 1,
      daysWithTarget: 1,
      daysOnTarget: 1,
    })
  })

  it("counts a day outside the tolerance as logged but not on target", () => {
    expect(macroWeek([day({ calories: 2400 })])).toEqual({
      daysLogged: 1,
      daysWithTarget: 1,
      daysOnTarget: 0,
    })
  })

  it("treats the tolerance as inclusive at both edges", () => {
    expect(macroWeek([day({ calories: 2200 })]).daysOnTarget).toBe(1)
    expect(macroWeek([day({ calories: 1800 })]).daysOnTarget).toBe(1)
    expect(macroWeek([day({ calories: 2201 })]).daysOnTarget).toBe(0)
  })

  // A day with nothing logged is not a day off target — it is a day with no data, and
  // scoring it as a miss would punish not tracking rather than not eating well.
  it("ignores unlogged days entirely", () => {
    const week = macroWeek([day({ logged: false }), day({ calories: 2000 })])
    expect(week).toEqual({ daysLogged: 1, daysWithTarget: 1, daysOnTarget: 1 })
  })

  // Before the first target period there is nothing to be on or off.
  it("counts a logged day with no target, but not against the target rate", () => {
    expect(macroWeek([day({ targetCalories: null })])).toEqual({
      daysLogged: 1,
      daysWithTarget: 0,
      daysOnTarget: 0,
    })
  })

  it("does not divide by a zero target", () => {
    expect(macroWeek([day({ targetCalories: 0 })])).toEqual({
      daysLogged: 1,
      daysWithTarget: 0,
      daysOnTarget: 0,
    })
  })

  it("handles an empty week", () => {
    expect(macroWeek([])).toEqual({
      daysLogged: 0,
      daysWithTarget: 0,
      daysOnTarget: 0,
    })
  })
})

describe("busiestDay", () => {
  it("finds the day with the most completions", () => {
    expect(
      busiestDay([
        task("a", "2026-07-20"),
        task("b", "2026-07-22"),
        task("c", "2026-07-22"),
      ]),
    ).toBe("2026-07-22")
  })

  it("breaks a tie toward the earlier day, so the answer is stable", () => {
    expect(busiestDay([task("a", "2026-07-22"), task("b", "2026-07-20")])).toBe(
      "2026-07-20",
    )
  })

  it("is null with nothing completed", () => {
    expect(busiestDay([])).toBeNull()
  })
})

describe("buildWeeklyReview", () => {
  it("counts tasks and carries the milestones through", () => {
    const review = buildWeeklyReview({
      ...base,
      tasksCompleted: [task("a", "2026-07-20"), task("b", "2026-07-20")],
      milestones: [
        {
          id: "m1",
          title: "Chapter one",
          goalTitle: "Write the book",
          completedOn: "2026-07-21",
        },
      ],
    })
    expect(review.tasks.completed).toBe(2)
    expect(review.tasks.busiestDay).toBe("2026-07-20")
    expect(review.milestones).toHaveLength(1)
    expect(review.isEmpty).toBe(false)
  })

  it("is empty only when nothing at all happened", () => {
    expect(buildWeeklyReview(base).isEmpty).toBe(true)
  })

  // Spending alone is a week worth showing — the page must not claim nothing happened
  // just because no task was ticked.
  it("is not empty when only money moved", () => {
    const review = buildWeeklyReview({
      ...base,
      money: { incomeCents: 0, expenseCents: 4200, netCents: -4200 },
    })
    expect(review.isEmpty).toBe(false)
  })

  it("is not empty when only meals were logged", () => {
    expect(buildWeeklyReview({ ...base, macroDays: [day()] }).isEmpty).toBe(
      false,
    )
  })

  it("copies its inputs rather than aliasing them", () => {
    const tasks = [task("a", "2026-07-20")]
    const review = buildWeeklyReview({ ...base, tasksCompleted: tasks })
    tasks.push(task("b", "2026-07-21"))
    expect(review.tasks.items).toHaveLength(1)
  })
})

describe("reviewHeadline", () => {
  const headline = (over: Parameters<typeof buildWeeklyReview>[0]) =>
    reviewHeadline(buildWeeklyReview(over))

  it("names both kinds when both moved", () => {
    expect(
      headline({
        ...base,
        tasksCompleted: [task("a", "2026-07-20")],
        milestones: [
          {
            id: "m",
            title: "t",
            goalTitle: "g",
            completedOn: "2026-07-20",
          },
        ],
      }),
    ).toBe("1 task and 1 milestone done")
  })

  it("pluralises", () => {
    expect(
      headline({
        ...base,
        tasksCompleted: [task("a", "2026-07-20"), task("b", "2026-07-21")],
      }),
    ).toBe("2 tasks done")
  })

  it("says something honest about a week with nothing in it", () => {
    expect(headline(base)).toBe("A quiet week")
  })
})
