import { describe, expect, it } from "vitest"

import { dateRange } from "@/lib/date"

import {
  adherence,
  currentPeriodFloor,
  habitStreak,
  heatmapLayout,
  periodLabel,
  periodPhrase,
  periodRange,
  periodStart,
  shiftPeriod,
  tallyByDay,
  tallyByPeriod,
  windowAdherence,
  type HabitRule,
} from "./service"

// 2026-07-19 is a Sunday, so weeks under the default `weekStartsOn: 0` begin
// 07-19, 07-26, 08-02, 08-09. Every fixture below is anchored on that.

/** `n` entries on one day. The maths counts rows, so the day only has to be inside. */
function on(date: string, n = 1) {
  return Array.from({ length: n }, () => ({ onDate: date }))
}

/** A weekly habit wanting `target` a week, running from `startDate`. */
function weekly(target: number, startDate = "2026-07-01"): HabitRule {
  return { period: "week", targetCount: target, startDate, endDate: null }
}

const WINDOW = { from: "2026-07-01", to: "2026-08-12" }

describe("periodStart", () => {
  it("is the date itself for a daily habit", () => {
    expect(periodStart("2026-07-22", "day")).toBe("2026-07-22")
  })

  it("honours the week-start preference", () => {
    // The same Sunday opens its own week, or closes the previous one.
    expect(periodStart("2026-07-19", "week", 0)).toBe("2026-07-19")
    expect(periodStart("2026-07-19", "week", 1)).toBe("2026-07-13")
  })

  it("anchors a month on the first", () => {
    expect(periodStart("2026-07-31", "month")).toBe("2026-07-01")
  })
})

describe("shiftPeriod", () => {
  it("steps days and weeks", () => {
    expect(shiftPeriod("2026-07-19", "day", -1)).toBe("2026-07-18")
    expect(shiftPeriod("2026-07-19", "week", -1)).toBe("2026-07-12")
    expect(shiftPeriod("2026-07-19", "week", 2)).toBe("2026-08-02")
  })

  it("rolls a month across the year boundary", () => {
    expect(shiftPeriod("2026-01-01", "month", -1)).toBe("2025-12-01")
    expect(shiftPeriod("2026-12-01", "month", 1)).toBe("2027-01-01")
  })

  // The reason months anchor on the 1st rather than carrying the original day: a naive
  // "add one month to January 31" overflows into March, and every period after it is
  // wrong. There is no 31st here to overflow.
  it("never overshoots February from a 31-day month", () => {
    expect(shiftPeriod("2026-01-31", "month", 1)).toBe("2026-02-01")
  })
})

describe("periodRange", () => {
  it("bounds a day, a week and a month inclusively", () => {
    expect(periodRange("2026-07-22", "day")).toEqual({
      start: "2026-07-22",
      end: "2026-07-22",
    })
    expect(periodRange("2026-07-22", "week", 0)).toEqual({
      start: "2026-07-19",
      end: "2026-07-25",
    })
    expect(periodRange("2026-07-22", "month")).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    })
  })

  it("ends February on the 28th, and a leap February on the 29th", () => {
    expect(periodRange("2026-02-10", "month").end).toBe("2026-02-28")
    expect(periodRange("2028-02-10", "month").end).toBe("2028-02-29")
  })
})

describe("currentPeriodFloor", () => {
  // The case the whole function exists for. On the 1st of a month the current WEEK
  // usually opened in the previous month, so "the start of the month" is too late a floor
  // and a weekly habit would lose the sessions logged in the days before it — a bug that
  // appears and disappears on a calendar.
  it("reaches into the previous month when the week straddles the boundary", () => {
    // 2026-08-01 is a Saturday: its Sunday-start week opened 07-26, its Monday-start
    // week opened 07-27, and the month opened the same day we are asking about.
    expect(currentPeriodFloor("2026-08-01", 0)).toBe("2026-07-26")
    expect(currentPeriodFloor("2026-08-01", 1)).toBe("2026-07-27")
  })

  it("is the month start whenever the month is the older of the two", () => {
    expect(currentPeriodFloor("2026-07-22", 0)).toBe("2026-07-01")
  })

  it("agrees with both when a month opens on a week start", () => {
    // 2026-11-01 is a Sunday, so under the default week start there is nothing to straddle.
    expect(currentPeriodFloor("2026-11-01", 0)).toBe("2026-11-01")
  })

  // The invariant `getHabitStrip` rests on, and the reason it may bound its scan at ~37
  // days where the habits page loads 400. If clipping the entries here could ever move the
  // figure, the strip and the page would disagree about the same habit.
  it("cannot change the adherence it bounds, at any cadence", () => {
    const today = "2026-08-01"
    const all = dateRange("2025-06-28", today).flatMap((date) => on(date, 2))
    const floor = currentPeriodFloor(today, 0)
    const bounded = all.filter((entry) => entry.onDate >= floor)

    for (const period of ["day", "week", "month"] as const) {
      const rule = { period, targetCount: 3 }
      expect(
        adherence(tallyByPeriod(bounded, period, 0), rule, today, 0),
      ).toEqual(adherence(tallyByPeriod(all, period, 0), rule, today, 0))
    }
  })
})

describe("tallyByPeriod", () => {
  // Two sessions on one day is two rows — the whole reason `habit_entries` has no unique
  // constraint on (habit_id, on_date).
  it("counts several entries on the same day", () => {
    const tally = tallyByPeriod(on("2026-07-22", 2), "day")
    expect(tally.get("2026-07-22")).toBe(2)
  })

  it("buckets a week's entries onto its start date", () => {
    const tally = tallyByPeriod(
      [...on("2026-07-20"), ...on("2026-07-24"), ...on("2026-07-28")],
      "week",
      0,
    )
    expect(tally.get("2026-07-19")).toBe(2)
    expect(tally.get("2026-07-26")).toBe(1)
  })

  it("puts a Sunday in the previous week when weeks start Monday", () => {
    const tally = tallyByPeriod(on("2026-07-19"), "week", 1)
    expect(tally.get("2026-07-13")).toBe(1)
  })

  it("keeps the 31st in its own month", () => {
    const tally = tallyByPeriod(on("2026-07-31"), "month")
    expect(tally.get("2026-07-01")).toBe(1)
    expect(tally.get("2026-08-01")).toBeUndefined()
  })
})

describe("tallyByDay", () => {
  it("counts per local day, ignoring the period entirely", () => {
    const tally = tallyByDay([...on("2026-07-22", 3), ...on("2026-07-23")])
    expect(tally.get("2026-07-22")).toBe(3)
    expect(tally.get("2026-07-23")).toBe(1)
  })
})

describe("adherence", () => {
  const habit = weekly(3)
  const at = (n: number) =>
    adherence(
      tallyByPeriod(on("2026-07-22", n), "week", 0),
      habit,
      "2026-07-22",
      0,
    )

  it("reports the period's bounds", () => {
    expect(at(0).start).toBe("2026-07-19")
    expect(at(0).end).toBe("2026-07-25")
  })

  it("counts up to the target", () => {
    expect(at(0)).toMatchObject({
      done: 0,
      percent: 0,
      remaining: 3,
      met: false,
    })
    expect(at(2)).toMatchObject({
      done: 2,
      percent: 67,
      remaining: 1,
      met: false,
    })
    expect(at(3)).toMatchObject({
      done: 3,
      percent: 100,
      remaining: 0,
      met: true,
    })
  })

  // Truthful in the number, clamped in the bar. A 133% progress bar is a rendering bug;
  // "4 of 3" is a real and motivating thing to have done.
  it("tells the truth about an overshoot without overflowing", () => {
    expect(at(4)).toMatchObject({
      done: 4,
      percent: 100,
      remaining: 0,
      met: true,
    })
  })

  it("ignores entries in a neighbouring period", () => {
    const tally = tallyByPeriod(on("2026-07-26", 5), "week", 0)
    expect(adherence(tally, habit, "2026-07-22", 0).done).toBe(0)
  })

  // Only reachable through `account/import.ts`, which runs no Zod — but it reaches here.
  it("treats a zero target as one rather than dividing by zero", () => {
    const broken = { ...weekly(0) }
    const result = adherence(new Map(), broken, "2026-07-22", 0)
    expect(result.target).toBe(1)
    expect(result.percent).toBe(0)
  })

  // Called with ONLY the two fields it declares. `getHabitStrip` selects exactly these
  // columns, so a `startDate` or `endDate` read creeping back into this function would
  // break the strip at runtime; this test makes it a compile error instead.
  it("needs nothing but the period and the target", () => {
    const tally = tallyByPeriod(on("2026-07-22", 2), "week", 0)
    expect(
      adherence(tally, { period: "week", targetCount: 3 }, "2026-07-22", 0),
    ).toMatchObject({ done: 2, target: 3, remaining: 1, met: false })
  })
})

describe("habitStreak", () => {
  const habit = weekly(3)
  const met = (...weekStarts: string[]) =>
    tallyByPeriod(
      weekStarts.flatMap((start) => on(start, 3)),
      "week",
      0,
    )

  // The rule the whole primitive turns on: at 9am on Monday a "3 a week" habit is at 0/3,
  // and judging that would report a broken streak every Monday morning.
  it("forgives the period in progress", () => {
    const tally = met("2026-07-19", "2026-07-26", "2026-08-02")
    // "today" is 2026-08-12, in the still-empty week starting 08-09.
    expect(habitStreak(tally, habit, WINDOW, 0).current).toBe(3)
  })

  it("counts the current period as soon as it meets the target", () => {
    const tally = met("2026-07-26", "2026-08-02", "2026-08-09")
    expect(habitStreak(tally, habit, WINDOW, 0).current).toBe(3)
  })

  it("still forgives a current period that is only part-way there", () => {
    const tally = tallyByPeriod(
      [...on("2026-07-27", 3), ...on("2026-08-03", 3), ...on("2026-08-10", 1)],
      "week",
      0,
    )
    expect(habitStreak(tally, habit, WINDOW, 0).current).toBe(2)
  })

  // Forgiveness is one deep AND positional — a gap behind the current period is a break.
  it("does not forgive a miss behind the current period", () => {
    const tally = met("2026-07-19", "2026-07-26")
    const streak = habitStreak(tally, habit, WINDOW, 0)
    expect(streak.current).toBe(0)
    expect(streak.best).toBe(2)
  })

  it("finds a longer earlier run than the current one", () => {
    const tally = met("2026-07-05", "2026-07-12", "2026-07-19", "2026-08-09")
    const streak = habitStreak(tally, habit, WINDOW, 0)
    expect(streak.current).toBe(1)
    expect(streak.best).toBe(3)
  })

  it("is not broken by the void before the habit started", () => {
    const late = weekly(3, "2026-07-26")
    const tally = met("2026-07-26", "2026-08-02", "2026-08-09")
    expect(habitStreak(tally, late, WINDOW, 0).current).toBe(3)
  })

  // An ended habit's last period is finished, so it is judged rather than forgiven — and
  // the walk anchors there, so the habit keeps the streak it ended with.
  it("keeps the streak an ended habit finished with", () => {
    const ended: HabitRule = { ...weekly(3), endDate: "2026-08-01" }
    const tally = met("2026-07-19", "2026-07-26")
    expect(habitStreak(tally, ended, WINDOW, 0).current).toBe(2)
  })

  it("judges an ended habit's final period instead of forgiving it", () => {
    const ended: HabitRule = { ...weekly(3), endDate: "2026-08-01" }
    // Nothing in the week of 07-26, which is where `endDate` falls.
    const tally = met("2026-07-05", "2026-07-12", "2026-07-19")
    const streak = habitStreak(tally, ended, WINDOW, 0)
    expect(streak.current).toBe(0)
    expect(streak.best).toBe(3)
  })

  it("walks months across a year boundary", () => {
    const monthly: HabitRule = {
      period: "month",
      targetCount: 1,
      startDate: "2025-10-01",
      endDate: null,
    }
    const tally = tallyByPeriod(
      [...on("2025-11-14"), ...on("2025-12-03"), ...on("2026-01-20")],
      "month",
    )
    const streak = habitStreak(
      tally,
      monthly,
      { from: "2025-10-01", to: "2026-01-25" },
      0,
    )
    expect(streak.current).toBe(3)
  })

  it("is zero for a habit with nothing logged", () => {
    expect(habitStreak(new Map(), habit, WINDOW, 0)).toEqual({
      current: 0,
      best: 0,
    })
  })

  // The clamp doing real work: the same tally read through two windows. Anything below
  // `window.from` was never loaded in production, so counting it would report a streak the
  // data cannot support.
  it("stops at the loaded window rather than running through the whole tally", () => {
    const tally = met(
      "2026-07-05",
      "2026-07-12",
      "2026-07-19",
      "2026-07-26",
      "2026-08-02",
      "2026-08-09",
    )
    expect(habitStreak(tally, habit, WINDOW, 0).current).toBe(6)
    const narrow = { from: "2026-08-01", to: "2026-08-12" }
    expect(habitStreak(tally, habit, narrow, 0).current).toBe(3)
  })

  /**
   * The regression this tranche's e2e caught, and the moment the feature exists for.
   *
   * A habit created today lives entirely inside one partial period. An earlier version
   * rounded the streak's floor UP to the next whole period — the right rule for the ring's
   * denominator — which put a brand-new habit below its own floor: it read "3/3 this week"
   * and "Streak 0" no matter how many times it was logged.
   */
  it("credits a target met inside the habit's first, partial period", () => {
    // Created on the Wednesday; the week began the Sunday before.
    const fresh = weekly(3, "2026-08-12")
    expect(habitStreak(met("2026-08-09"), fresh, WINDOW, 0).current).toBe(1)
  })

  it("does not score a shortfall in that same partial period", () => {
    const fresh = weekly(3, "2026-08-12")
    const tally = tallyByPeriod(on("2026-08-10", 1), "week", 0)
    // 1 of 3, in a week the habit only existed for part of. Neither a streak nor a break.
    expect(habitStreak(tally, fresh, WINDOW, 0)).toEqual({
      current: 0,
      best: 0,
    })
  })
})

describe("windowAdherence", () => {
  const habit = weekly(3)

  // The period in progress is excluded rather than counted as a miss — a figure that
  // dropped every Monday would be measuring the clock, not the habit.
  it("excludes the period in progress from the denominator", () => {
    const tally = tallyByPeriod(
      [...on("2026-08-04", 3), ...on("2026-08-11", 3)],
      "week",
      0,
    )
    const result = windowAdherence(tally, habit, WINDOW, 0)
    // Weeks 07-05 … 08-02 are elapsed; 08-09 is in progress and not counted.
    expect(result.elapsed).toBe(5)
    expect(result.met).toBe(1)
  })

  it("counts only periods since the habit started", () => {
    const late = weekly(3, "2026-08-01")
    const tally = tallyByPeriod(on("2026-08-04", 3), "week", 0)
    const result = windowAdherence(tally, late, WINDOW, 0)
    expect(result).toEqual({ met: 1, elapsed: 1, percent: 100 })
  })

  it("is zero rather than NaN when nothing has elapsed yet", () => {
    const brandNew = weekly(3, "2026-08-10")
    expect(windowAdherence(new Map(), brandNew, WINDOW, 0)).toEqual({
      met: 0,
      elapsed: 0,
      percent: 0,
    })
  })
})

describe("periodLabel", () => {
  it("names a once-per-period habit after its cadence", () => {
    expect(periodLabel({ period: "day", targetCount: 1 })).toBe("Daily")
    expect(periodLabel({ period: "week", targetCount: 1 })).toBe("Weekly")
    expect(periodLabel({ period: "month", targetCount: 1 })).toBe("Monthly")
  })

  it("states the rate when there is one", () => {
    expect(periodLabel({ period: "week", targetCount: 3 })).toBe("3× a week")
    expect(periodLabel({ period: "day", targetCount: 2 })).toBe("2× a day")
  })
})

describe("periodPhrase", () => {
  // Asserted verbatim by the e2e ("0/3 this week", "0/1 today"), so these three strings
  // are a contract with the suite as much as a wording choice. It moved here out of
  // `habits-view.tsx` when the dashboard card needed the same phrase.
  it("names the span the count beside it belongs to", () => {
    expect(periodPhrase("day")).toBe("today")
    expect(periodPhrase("week")).toBe("this week")
    expect(periodPhrase("month")).toBe("this month")
  })
})

// Moved from `todos/habits.test.ts` in T12a with the function, unchanged apart from the
// renamed grid types.
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
