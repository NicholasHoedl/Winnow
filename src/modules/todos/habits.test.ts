import { describe, expect, it } from "vitest"

import {
  type HabitCycle,
  type HabitCycleStatus,
  completionRate,
  currentStreak,
  dateRange,
  habitCycles,
  heatmapLayout,
  longestStreak,
  reopenWouldDestroy,
} from "./habits"

/** A cycle the engine would have produced; `date` equals the key for daily rules. */
function expected(...dates: string[]) {
  return dates.map((d) => ({ occurrenceDate: d, date: d }))
}

/** Shorthand for a already-classified run, oldest first. */
function run(...statuses: HabitCycleStatus[]): HabitCycle[] {
  return statuses.map((status, i) => ({
    occurrenceDate: `2026-07-${String(i + 1).padStart(2, "0")}`,
    status,
  }))
}

describe("habitCycles", () => {
  it("classifies each cycle against the completed and skipped sets", () => {
    const cycles = habitCycles(
      expected("2026-07-01", "2026-07-02", "2026-07-03"),
      new Set(["2026-07-01"]),
      new Set(["2026-07-02"]),
    )
    expect(cycles).toEqual([
      { occurrenceDate: "2026-07-01", status: "completed" },
      { occurrenceDate: "2026-07-02", status: "skipped" },
      { occurrenceDate: "2026-07-03", status: "missed" },
    ])
  })

  // The exception row outlives the decision that wrote it, so doing the thing anyway has
  // to win — otherwise a skip you changed your mind about reads as a non-completion.
  it("lets a completion win over a skip on the same cycle", () => {
    const [cycle] = habitCycles(
      expected("2026-07-01"),
      new Set(["2026-07-01"]),
      new Set(["2026-07-01"]),
    )
    expect(cycle.status).toBe("completed")
  })

  it("sorts oldest first regardless of input order", () => {
    const cycles = habitCycles(
      expected("2026-07-03", "2026-07-01", "2026-07-02"),
      new Set(),
      new Set(),
    )
    expect(cycles.map((c) => c.occurrenceDate)).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ])
  })

  it("handles an empty window", () => {
    expect(habitCycles([], new Set(), new Set())).toEqual([])
  })
})

describe("currentStreak", () => {
  it("counts a clean run to the end", () => {
    expect(currentStreak(run("completed", "completed", "completed"))).toBe(3)
  })

  it("stops at a miss", () => {
    expect(
      currentStreak(run("completed", "missed", "completed", "completed")),
    ).toBe(2)
  })

  // The whole reason skip-once is its own table.
  it("carries the streak across a skip", () => {
    expect(
      currentStreak(run("completed", "skipped", "completed", "completed")),
    ).toBe(3)
  })

  // The last cycle is usually the CURRENT one, not yet done. Zeroing the streak every
  // morning until it is would make the number useless.
  it("forgives a single trailing miss, since it may still be in progress", () => {
    expect(currentStreak(run("completed", "completed", "missed"))).toBe(2)
  })

  it("does not forgive a second miss behind the trailing one", () => {
    expect(currentStreak(run("completed", "missed", "missed"))).toBe(0)
  })

  it("forgives only the trailing position, not a miss anywhere else", () => {
    // The miss is not last, so nothing is forgiven and the streak stops there.
    expect(currentStreak(run("completed", "missed", "completed"))).toBe(1)
  })

  it("is zero for an all-skipped or empty history", () => {
    expect(currentStreak(run("skipped", "skipped"))).toBe(0)
    expect(currentStreak([])).toBe(0)
  })
})

describe("longestStreak", () => {
  it("finds the best run, not the last one", () => {
    expect(
      longestStreak(
        run("completed", "completed", "completed", "missed", "completed"),
      ),
    ).toBe(3)
  })

  it("treats a skip as neutral rather than a break", () => {
    expect(
      longestStreak(run("completed", "skipped", "completed", "completed")),
    ).toBe(3)
  })

  it("resets on a miss", () => {
    expect(longestStreak(run("completed", "missed", "completed"))).toBe(1)
  })

  it("is zero with nothing completed", () => {
    expect(longestStreak(run("missed", "skipped"))).toBe(0)
    expect(longestStreak([])).toBe(0)
  })
})

describe("completionRate", () => {
  it("excludes skips from the denominator", () => {
    // 2 of 3 real chances, with a skip that shouldn't count against it.
    expect(
      completionRate(run("completed", "completed", "skipped", "missed")),
    ).toEqual({ completed: 2, expected: 3, percent: 67 })
  })

  it("is a clean 100 when nothing was missed", () => {
    expect(completionRate(run("completed", "skipped"))).toEqual({
      completed: 1,
      expected: 1,
      percent: 100,
    })
  })

  // Every cycle skipped means the habit never actually asked for anything — dividing by
  // zero here would be NaN on the page.
  it("is zero rather than NaN when every cycle was skipped", () => {
    expect(completionRate(run("skipped", "skipped"))).toEqual({
      completed: 0,
      expected: 0,
      percent: 0,
    })
    expect(completionRate([])).toEqual({
      completed: 0,
      expected: 0,
      percent: 0,
    })
  })
})

describe("dateRange", () => {
  it("includes both ends", () => {
    expect(dateRange("2026-07-01", "2026-07-04")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
    ])
  })

  it("returns a single day for an equal range", () => {
    expect(dateRange("2026-07-01", "2026-07-01")).toEqual(["2026-07-01"])
  })

  it("crosses a month boundary", () => {
    expect(dateRange("2026-07-30", "2026-08-01")).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ])
  })

  it("is empty when the range runs backwards", () => {
    expect(dateRange("2026-07-04", "2026-07-01")).toEqual([])
  })
})

describe("reopenWouldDestroy", () => {
  const cycle = { occurrenceDate: "2026-07-22", date: "2026-07-22" }

  it("leaves a one-off task alone — nothing retires it", () => {
    expect(
      reopenWouldDestroy({ seriesId: null, occurrenceDate: null }, cycle),
    ).toBe(false)
  })

  it("allows re-opening the current cycle", () => {
    expect(
      reopenWouldDestroy(
        { seriesId: "rule", occurrenceDate: "2026-07-22" },
        cycle,
      ),
    ).toBe(false)
  })

  it("blocks re-opening an earlier cycle", () => {
    expect(
      reopenWouldDestroy(
        { seriesId: "rule", occurrenceDate: "2026-07-15" },
        cycle,
      ),
    ).toBe(true)
  })

  // A rule past its end date has no current cycle, so syncRuleInstances deletes every
  // open instance under it — re-opening any of them destroys it.
  it("blocks re-opening anything under an ended rule", () => {
    expect(
      reopenWouldDestroy(
        { seriesId: "rule", occurrenceDate: "2026-07-22" },
        null,
      ),
    ).toBe(true)
  })

  it("treats a series row with no occurrence key as a one-off", () => {
    expect(
      reopenWouldDestroy({ seriesId: "rule", occurrenceDate: null }, cycle),
    ).toBe(false)
  })
})

describe("heatmapLayout", () => {
  // 2026-07-19 is a Sunday.
  const twoWeeks = dateRange("2026-07-19", "2026-08-01")

  it("puts a week-start date at the top-left", () => {
    const grid = heatmapLayout(twoWeeks, 0)
    expect(grid.cells[0]).toEqual({ date: "2026-07-19", col: 0, row: 0 })
  })

  it("fills a column per week and steps across at the boundary", () => {
    const grid = heatmapLayout(twoWeeks, 0)
    const at = (date: string) => grid.cells.find((c) => c.date === date)
    expect(at("2026-07-25")).toEqual({ date: "2026-07-25", col: 0, row: 6 })
    expect(at("2026-07-26")).toEqual({ date: "2026-07-26", col: 1, row: 0 })
    expect(grid.cols).toBe(2)
    expect(grid.rows).toBe(7)
  })

  // The same Sunday is the LAST row of the preceding week when weeks start Monday, and
  // the grid has to be anchored a week earlier for that to line up.
  it("re-anchors the grid for a Monday week start", () => {
    const grid = heatmapLayout(twoWeeks, 1)
    const at = (date: string) => grid.cells.find((c) => c.date === date)
    expect(at("2026-07-19")).toEqual({ date: "2026-07-19", col: 0, row: 6 })
    expect(at("2026-07-20")).toEqual({ date: "2026-07-20", col: 1, row: 0 })
  })

  it("keeps every date, and never lands outside the seven rows", () => {
    const grid = heatmapLayout(dateRange("2026-05-04", "2026-08-01"), 0)
    expect(grid.cells).toHaveLength(90)
    for (const cell of grid.cells) {
      expect(cell.row).toBeGreaterThanOrEqual(0)
      expect(cell.row).toBeLessThan(7)
      expect(cell.col).toBeLessThan(grid.cols)
    }
  })

  it("handles an empty range", () => {
    expect(heatmapLayout([], 0)).toEqual({ cells: [], cols: 0, rows: 7 })
  })
})
