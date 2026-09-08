import { describe, expect, it } from "vitest"

import { groupPracticeByPeriod } from "./goal-practice"

const habit = (
  id: string,
  period: "day" | "week" | "month",
  goalId: string | null = null,
) => ({ id, period, goalId })

describe("groupPracticeByPeriod", () => {
  it("groups by cadence, day before week before month", () => {
    const groups = groupPracticeByPeriod([
      habit("rent", "month"),
      habit("class", "week"),
      habit("words", "day"),
    ])

    expect(groups.map((g) => g.period)).toEqual(["day", "week", "month"])
  })

  it("keeps the habits' own order inside a group", () => {
    // `getHabitStrip` orders by [sortOrder, createdAt], which a drag on the habits page
    // writes. Re-sorting here — unmet first, say — would undo that, and would reorder the
    // card from one day to the next as quotas were met. The cap that once made an
    // unmet-first sort necessary is long gone.
    const groups = groupPracticeByPeriod([
      habit("second", "week"),
      habit("first", "week"),
    ])

    expect(groups[0].habits.map((h) => h.id)).toEqual(["second", "first"])
  })

  it("omits a cadence nobody keeps", () => {
    // A heading over nothing is a row of dead space on a card that already runs tight.
    const groups = groupPracticeByPeriod([habit("words", "day")])

    expect(groups).toHaveLength(1)
    expect(groups[0].period).toBe("day")
  })

  it("returns nothing for no habits at all", () => {
    expect(groupPracticeByPeriod([])).toEqual([])
  })

  it("groups a habit with no goal alongside the rest", () => {
    // The goal is an ANNOTATION now, not the thing that decides where a row lives — which
    // is the whole inversion this function represents. A practice kept for its own sake
    // sits in its cadence like any other, rather than in a trailing bucket of its own.
    const groups = groupPracticeByPeriod([
      habit("attached", "week", "kanji"),
      habit("loose", "week", null),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].habits.map((h) => h.id)).toEqual(["attached", "loose"])
  })
})
