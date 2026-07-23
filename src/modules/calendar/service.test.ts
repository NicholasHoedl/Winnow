import { describe, expect, it } from "vitest"

import {
  applyExceptions,
  bucketByDay,
  expandOccurrences,
  goalProgress,
  localDateTime,
  monthGrid,
  zonedDateTimeToUtc,
  type ExceptionOverlay,
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
    recurrenceWeekdays: 0,
    recurrenceMonthlyMode: "day_of_month",
    recurrenceEndDate: null,
    ...over,
  }
}

// Weekday bit helpers (0=Sun..6=Sat) for BYDAY tests.
const WD = { SUN: 1, MON: 2, TUE: 4, WED: 8, THU: 16, FRI: 32, SAT: 64 }

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
        seriesEvent: ev(),
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

  it("weekly on Mondays only (BYDAY)", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2026-07-06T09:00:00Z", // a Monday
        recurrenceFreq: "weekly",
        recurrenceWeekdays: WD.MON,
      }),
      "2026-07-01",
      "2026-08-01",
      "UTC",
    )
    expect(dates(occ)).toEqual([
      "2026-07-06",
      "2026-07-13",
      "2026-07-20",
      "2026-07-27",
    ])
  })

  it("weekly on weekdays Mon–Fri excludes the weekend", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2026-07-06T09:00:00Z",
        recurrenceFreq: "weekly",
        recurrenceWeekdays: WD.MON | WD.TUE | WD.WED | WD.THU | WD.FRI,
      }),
      "2026-07-06",
      "2026-07-13", // one week window
      "UTC",
    )
    expect(dates(occ)).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
    ])
  })

  it("every other Tuesday (weekly interval 2 + BYDAY)", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2026-07-07T09:00:00Z", // a Tuesday
        recurrenceFreq: "weekly",
        recurrenceInterval: 2,
        recurrenceWeekdays: WD.TUE,
      }),
      "2026-07-01",
      "2026-08-01",
      "UTC",
    )
    // 07-14 and 07-28 fall in off-weeks.
    expect(dates(occ)).toEqual(["2026-07-07", "2026-07-21"])
  })

  it("weekly with no weekday set repeats on the anchor weekday only (legacy)", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2026-07-15T09:00:00Z", // a Wednesday
        recurrenceFreq: "weekly",
        recurrenceWeekdays: 0,
      }),
      "2026-07-01",
      "2026-08-01",
      "UTC",
    )
    expect(dates(occ)).toEqual(["2026-07-15", "2026-07-22", "2026-07-29"])
  })

  it("monthly on the 3rd Monday (nth_weekday)", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2026-07-20T09:00:00Z", // 3rd Monday of July 2026
        recurrenceFreq: "monthly",
        recurrenceMonthlyMode: "nth_weekday",
      }),
      "2026-07-01",
      "2026-10-01",
      "UTC",
    )
    expect(dates(occ)).toEqual(["2026-07-20", "2026-08-17", "2026-09-21"])
  })

  it("monthly on the last Friday (nth_weekday, last)", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2026-07-31T09:00:00Z", // last Friday of July 2026
        recurrenceFreq: "monthly",
        recurrenceMonthlyMode: "nth_weekday",
      }),
      "2026-07-01",
      "2026-10-01",
      "UTC",
    )
    expect(dates(occ)).toEqual(["2026-07-31", "2026-08-28", "2026-09-25"])
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

// An overlayable event (recurrence shape + the fields exceptions can replace).
type OverlayEvent = RecurringEvent & {
  id: string
  title: string
  notes: string | null
  calendarId: string | null
}

// A weekday (Mon–Fri) series, so exceptions have several occurrences to act on.
function oev(over: Partial<OverlayEvent> = {}): OverlayEvent {
  return {
    id: "evt-1",
    title: "Standup",
    notes: null,
    calendarId: null,
    startAt: "2026-07-06T09:00:00Z", // Monday
    endAt: "2026-07-06T09:30:00Z",
    allDay: false,
    recurrenceFreq: "weekly",
    recurrenceInterval: 1,
    recurrenceWeekdays: WD.MON | WD.TUE | WD.WED | WD.THU | WD.FRI,
    recurrenceMonthlyMode: "day_of_month",
    recurrenceEndDate: null,
    ...over,
  }
}

function exc(over: Partial<ExceptionOverlay> = {}): ExceptionOverlay {
  return {
    eventId: "evt-1",
    originalDate: "2026-07-08", // Wednesday
    canceled: false,
    startAt: null,
    endAt: null,
    allDay: null,
    title: null,
    notes: null,
    calendarId: null,
    ...over,
  }
}

describe("applyExceptions", () => {
  // Mon–Fri 09:00–09:30 for the week of the 6th: 06, 07, 08, 09, 10.
  const week = () => expandOccurrences(oev(), "2026-07-06", "2026-07-11", "UTC")

  it("returns the same array when there are no exceptions", () => {
    const occs = week()
    expect(applyExceptions(occs, [], "UTC")).toBe(occs)
  })

  it("drops a canceled occurrence, leaving the rest intact", () => {
    const result = applyExceptions(week(), [exc({ canceled: true })], "UTC")
    expect(dates(result)).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-09",
      "2026-07-10",
    ])
  })

  it("reschedules only the overridden day's time", () => {
    const result = applyExceptions(
      week(),
      [
        exc({
          startAt: "2026-07-08T14:00:00Z",
          endAt: "2026-07-08T15:00:00Z",
        }),
      ],
      "UTC",
    )
    const day8 = result.find((o) => o.date === "2026-07-08")!
    expect([day8.time, day8.endTime]).toEqual(["14:00", "15:00"])
    // Neighbours keep the series time.
    expect(result.find((o) => o.date === "2026-07-07")!.time).toBe("09:00")
    expect(result.find((o) => o.date === "2026-07-09")!.time).toBe("09:00")
  })

  it("overrides fields on the effective event but preserves the series", () => {
    const result = applyExceptions(
      week(),
      [exc({ title: "Team sync", notes: "Q3 review", calendarId: "cal-9" })],
      "UTC",
    )
    const day8 = result.find((o) => o.date === "2026-07-08")!
    expect(day8.event.title).toBe("Team sync")
    expect(day8.event.notes).toBe("Q3 review")
    expect(day8.event.calendarId).toBe("cal-9")
    // The untouched series row stays on seriesEvent.
    expect(day8.seriesEvent.title).toBe("Standup")
    expect(day8.seriesEvent.calendarId).toBeNull()
    // The span stays on the occurrence's own day even though endAt is inherited from
    // the series anchor (07-06) — never dragged back to the anchor's date.
    expect(day8.endDate).toBe("2026-07-08")
    expect([day8.time, day8.endTime]).toEqual(["09:00", "09:30"])
    // A neighbour is a pure pass-through (event === seriesEvent).
    const day7 = result.find((o) => o.date === "2026-07-07")!
    expect(day7.event).toBe(day7.seriesEvent)
  })

  it("keeps a title-only override on its own day through bucketing", () => {
    // Regression: a partial override inherits the series endAt (anchored on 07-06), so
    // endDate must be re-anchored to occ.date — otherwise the backwards span is dropped
    // by bucketByDay and the occurrence silently vanishes from the calendar.
    const overlaid = applyExceptions(week(), [exc({ title: "Renamed" })], "UTC")
    const buckets = bucketByDay(overlaid)
    expect(buckets["2026-07-08"]?.map((o) => o.event.title)).toEqual(["Renamed"])
  })

  it("nulls the time when an override makes the occurrence all-day", () => {
    const result = applyExceptions(week(), [exc({ allDay: true })], "UTC")
    const day8 = result.find((o) => o.date === "2026-07-08")!
    expect(day8.event.allDay).toBe(true)
    expect([day8.time, day8.endTime]).toEqual([null, null])
  })

  it("ignores exceptions whose date or event id does not match", () => {
    const result = applyExceptions(
      week(),
      [
        exc({ originalDate: "2026-07-11", canceled: true }), // Saturday — no such occurrence
        exc({ eventId: "other-evt", canceled: true }), // different series
      ],
      "UTC",
    )
    expect(dates(result)).toEqual(dates(week()))
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
