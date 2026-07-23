import { describe, expect, it } from "vitest"

import {
  bucketByDay,
  expandOccurrences,
  goalProgress,
  localDateTime,
  monthGrid,
  zonedDateTimeToUtc,
  type RecurringEvent,
} from "./service"

// Minimal event builder. tz "UTC" in most tests so an instant's UTC date is its
// local date, keeping recurrence assertions easy to reason about.
function ev(over: Partial<RecurringEvent> = {}): RecurringEvent {
  return {
    startAt: "2026-07-15T12:00:00Z",
    endAt: null,
    allDay: false,
    recurrenceFreq: "none",
    recurrenceInterval: 1,
    recurrenceEndDate: null,
    ...over,
  }
}

const dates = (occs: { date: string }[]) => occs.map((o) => o.date)

describe("localDateTime", () => {
  it("splits an instant into local date + 24h time", () => {
    expect(localDateTime(new Date("2026-07-15T18:30:00Z"), "UTC")).toEqual({
      date: "2026-07-15",
      time: "18:30",
    })
  })

  it("applies the timezone offset (Chicago is UTC-5 in July)", () => {
    // 02:30Z on the 15th is 21:30 on the 14th in Chicago (CDT).
    expect(
      localDateTime(new Date("2026-07-15T02:30:00Z"), "America/Chicago"),
    ).toEqual({ date: "2026-07-14", time: "21:30" })
  })

  it("renders midnight as 00:00, not 24:00", () => {
    expect(localDateTime(new Date("2026-07-15T00:00:00Z"), "UTC")).toEqual({
      date: "2026-07-15",
      time: "00:00",
    })
  })
})

describe("zonedDateTimeToUtc (inverse of localDateTime)", () => {
  it("round-trips a summer (CDT) wall-clock through Chicago", () => {
    const tz = "America/Chicago"
    expect(localDateTime(zonedDateTimeToUtc("2026-07-15", "14:30", tz), tz)).toEqual({
      date: "2026-07-15",
      time: "14:30",
    })
  })

  it("round-trips a winter (CST) wall-clock through Chicago", () => {
    const tz = "America/Chicago"
    expect(localDateTime(zonedDateTimeToUtc("2026-01-15", "09:00", tz), tz)).toEqual({
      date: "2026-01-15",
      time: "09:00",
    })
  })

  it("treats a UTC midnight literally", () => {
    expect(zonedDateTimeToUtc("2026-07-15", "00:00", "UTC").toISOString()).toBe(
      "2026-07-15T00:00:00.000Z",
    )
  })
})

describe("expandOccurrences — single events", () => {
  it("emits a one-off event that lands in range", () => {
    const occ = expandOccurrences(ev(), "2026-07-01", "2026-08-01", "UTC")
    expect(occ).toEqual([
      {
        event: ev(),
        date: "2026-07-15",
        endDate: "2026-07-15",
        time: "12:00",
        endTime: null,
      },
    ])
  })

  it("omits a one-off event outside the range", () => {
    expect(expandOccurrences(ev(), "2026-08-01", "2026-09-01", "UTC")).toEqual([])
  })

  it("keeps a multi-day span (date..endDate)", () => {
    const occ = expandOccurrences(
      ev({ startAt: "2026-07-15T12:00:00Z", endAt: "2026-07-17T15:00:00Z" }),
      "2026-07-01",
      "2026-08-01",
      "UTC",
    )
    expect(occ).toHaveLength(1)
    expect(occ[0].date).toBe("2026-07-15")
    expect(occ[0].endDate).toBe("2026-07-17")
    expect(occ[0].endTime).toBe("15:00")
  })

  it("marks all-day events with a null time", () => {
    const occ = expandOccurrences(
      ev({ startAt: "2026-07-15T00:00:00Z", allDay: true }),
      "2026-07-01",
      "2026-08-01",
      "UTC",
    )
    expect(occ[0].time).toBeNull()
  })
})

describe("expandOccurrences — recurrence", () => {
  it("daily, interval 1", () => {
    const occ = expandOccurrences(
      ev({ startAt: "2026-07-01T09:00:00Z", recurrenceFreq: "daily" }),
      "2026-07-01",
      "2026-07-08",
      "UTC",
    )
    expect(dates(occ)).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
    ])
  })

  it("every-2-weeks (weekly, interval 2)", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2026-07-01T09:00:00Z",
        recurrenceFreq: "weekly",
        recurrenceInterval: 2,
      }),
      "2026-07-01",
      "2026-08-15",
      "UTC",
    )
    expect(dates(occ)).toEqual([
      "2026-07-01",
      "2026-07-15",
      "2026-07-29",
      "2026-08-12",
    ])
  })

  it("monthly anchored on the 31st SKIPS months without a 31st", () => {
    const occ = expandOccurrences(
      ev({ startAt: "2026-01-31T09:00:00Z", recurrenceFreq: "monthly" }),
      "2026-01-01",
      "2026-07-01",
      "UTC",
    )
    // Feb, Apr, Jun have no 31st → skipped.
    expect(dates(occ)).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"])
  })

  it("yearly on Feb 29 only emits in leap years", () => {
    const occ = expandOccurrences(
      ev({ startAt: "2024-02-29T09:00:00Z", recurrenceFreq: "yearly" }),
      "2024-01-01",
      "2033-01-01",
      "UTC",
    )
    expect(dates(occ)).toEqual(["2024-02-29", "2028-02-29", "2032-02-29"])
  })

  it("respects an inclusive recurrence end date", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2026-07-01T09:00:00Z",
        recurrenceFreq: "daily",
        recurrenceEndDate: "2026-07-03",
      }),
      "2026-07-01",
      "2026-08-01",
      "UTC",
    )
    expect(dates(occ)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"])
  })

  it("handles a far-future series without iterating from the anchor forever", () => {
    const occ = expandOccurrences(
      ev({ startAt: "2000-01-01T09:00:00Z", recurrenceFreq: "monthly" }),
      "2075-03-01",
      "2075-06-01",
      "UTC",
    )
    expect(dates(occ)).toEqual(["2075-03-01", "2075-04-01", "2075-05-01"])
  })

  it("a far-future single event shows only in its month", () => {
    const e = ev({ startAt: "2035-06-15T12:00:00Z" })
    expect(dates(expandOccurrences(e, "2035-06-01", "2035-07-01", "UTC"))).toEqual([
      "2035-06-15",
    ])
    expect(expandOccurrences(e, "2026-01-01", "2026-02-01", "UTC")).toEqual([])
  })
})

describe("monthGrid", () => {
  it("is a rectangular Sunday-started grid covering the whole month", () => {
    const grid = monthGrid("2026-07")
    expect(grid.every((week) => week.length === 7)).toBe(true)

    const flat = grid.flat()
    // Contiguous, one day apart.
    for (let i = 1; i < flat.length; i++) {
      const prev = new Date(`${flat[i - 1]}T00:00:00Z`).getTime()
      const cur = new Date(`${flat[i]}T00:00:00Z`).getTime()
      expect(cur - prev).toBe(86_400_000)
    }
    // Starts on a Sunday, ends on a Saturday.
    expect(new Date(`${flat[0]}T00:00:00Z`).getUTCDay()).toBe(0)
    expect(new Date(`${flat.at(-1)}T00:00:00Z`).getUTCDay()).toBe(6)
    // Covers every day of July.
    expect(flat).toContain("2026-07-01")
    expect(flat).toContain("2026-07-31")
  })

  it("starts on Monday when weekStartsOn is 1", () => {
    const grid = monthGrid("2026-07", 1)
    expect(grid.every((week) => week.length === 7)).toBe(true)
    const flat = grid.flat()
    // Starts on a Monday, ends on a Sunday.
    expect(new Date(`${flat[0]}T00:00:00Z`).getUTCDay()).toBe(1)
    expect(new Date(`${flat.at(-1)}T00:00:00Z`).getUTCDay()).toBe(0)
    expect(flat).toContain("2026-07-01")
    expect(flat).toContain("2026-07-31")
  })
})

describe("bucketByDay", () => {
  it("groups occurrences by date and spreads multi-day spans across days", () => {
    const occs = expandOccurrences(
      ev({ startAt: "2026-07-10T12:00:00Z", endAt: "2026-07-12T12:00:00Z" }),
      "2026-07-01",
      "2026-08-01",
      "UTC",
    )
    const buckets = bucketByDay(occs)
    expect(Object.keys(buckets).sort()).toEqual([
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ])
  })
})

describe("goalProgress", () => {
  it("is 0 with no milestones", () => {
    expect(goalProgress([])).toEqual({ done: 0, total: 0, percent: 0 })
  })

  it("computes done/total/percent", () => {
    expect(
      goalProgress([{ done: true }, { done: false }, { done: true }, { done: false }]),
    ).toEqual({ done: 2, total: 4, percent: 50 })
  })

  it("is 100 when all complete", () => {
    expect(goalProgress([{ done: true }, { done: true }])).toEqual({
      done: 2,
      total: 2,
      percent: 100,
    })
  })
})
