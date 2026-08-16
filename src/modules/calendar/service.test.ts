import { describe, expect, it } from "vitest"

import {
  applyExceptions,
  bucketByDay,
  expandOccurrences,
  inboundOccurrenceDates,
  localDateTime,
  monthGrid,
  occurrenceKey,
  overrideDate,
  splitSeriesAt,
  weekDates,
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
        originalDate: "2026-07-15",
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

// A recurring multi-day event is in view when its SPAN overlaps the range, which is
// what the one-off path has always done ("keeps a multi-day span" above). Each
// frequency seeks to its first candidate differently, so each seek is covered: all
// four used to start at rangeStart and silently drop the occurrence that begins
// before the range and reaches into it. A single-day range is used throughout so
// only the overlapping occurrence can match.
describe("expandOccurrences — recurring spans overlapping the range", () => {
  it("weekly (no BYDAY): a Wed–Fri span seen from the Thursday", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2026-07-01T12:00:00Z", // Wednesday
        endAt: "2026-07-03T15:00:00Z", // Friday, +2 days
        recurrenceFreq: "weekly",
      }),
      "2026-07-09",
      "2026-07-10",
      "UTC",
    )
    expect(occ).toHaveLength(1)
    expect(occ[0].date).toBe("2026-07-08")
    expect(occ[0].endDate).toBe("2026-07-10")
  })

  it("weekly BYDAY: a Mon–Wed span seen from the Tuesday", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2026-07-06T09:00:00Z", // Monday
        endAt: "2026-07-08T17:00:00Z", // Wednesday, +2 days
        recurrenceFreq: "weekly",
        recurrenceWeekdays: WD.MON,
      }),
      "2026-07-14", // Tuesday of the following week
      "2026-07-15",
      "UTC",
    )
    expect(dates(occ)).toEqual(["2026-07-13"])
  })

  it("monthly: a span crossing into the next month", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2026-01-30T12:00:00Z",
        endAt: "2026-02-02T12:00:00Z", // +3 days
        recurrenceFreq: "monthly",
      }),
      "2026-04-01",
      "2026-04-02",
      "UTC",
    )
    // February has no 30th, so the March occurrence is the one reaching into April.
    expect(dates(occ)).toEqual(["2026-03-30"])
  })

  it("yearly: a span crossing into the next year", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2025-12-30T12:00:00Z",
        endAt: "2026-01-02T12:00:00Z", // +3 days
        recurrenceFreq: "yearly",
      }),
      "2027-01-01",
      "2027-01-02",
      "UTC",
    )
    expect(dates(occ)).toEqual(["2026-12-30"])
  })

  it("still excludes a span that ends before the range starts", () => {
    const occ = expandOccurrences(
      ev({
        startAt: "2026-07-01T12:00:00Z",
        endAt: "2026-07-03T15:00:00Z",
        recurrenceFreq: "weekly",
      }),
      "2026-07-11", // the 08–10 occurrence ended yesterday; the next starts the 15th
      "2026-07-12",
      "UTC",
    )
    expect(occ).toEqual([])
  })
})

// An overlayable event (recurrence shape + the fields exceptions can replace).
type OverlayEvent = RecurringEvent & {
  id: string
  title: string
  notes: string | null
  calendarId: string | null
  highlighted: boolean
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
    highlighted: false,
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
    highlighted: null,
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

  it("highlights one date of an unhighlighted series", () => {
    // The case the nullable column exists for: a weekly standup you want on the dashboard
    // once, without pinning every future standup there.
    const result = applyExceptions(week(), [exc({ highlighted: true })], "UTC")
    const flagged = result.filter((o) => o.event.highlighted).map((o) => o.date)
    expect(flagged).toEqual(["2026-07-08"])
  })

  it("un-highlights one date of a highlighted series", () => {
    // The asymmetry `??` buys, and the reason the column is `boolean | null` rather than a
    // plain boolean: an override of FALSE has to beat a series of TRUE. A `||` here would
    // silently fall back to the series and this date would stay highlighted.
    const result = applyExceptions(
      expandOccurrences(
        oev({ highlighted: true }),
        "2026-07-06",
        "2026-07-11",
        "UTC",
      ),
      [exc({ highlighted: false })],
      "UTC",
    )
    const flagged = result.filter((o) => o.event.highlighted).map((o) => o.date)
    expect(flagged).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-09",
      "2026-07-10",
    ])
  })

  it("inherits the series flag on dates with no override", () => {
    const result = applyExceptions(
      expandOccurrences(
        oev({ highlighted: true }),
        "2026-07-06",
        "2026-07-11",
        "UTC",
      ),
      [exc({ title: "Renamed" })],
      "UTC",
    )
    expect(result.every((o) => o.event.highlighted)).toBe(true)
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

  // --- moving an occurrence to another day.
  //
  // An override carries a full instant, so the day it lands on is already stored and
  // needs no column of its own. What used to pin `date` to the occurrence's original
  // day was a v1 decision, not a missing field.

  it("moves an occurrence to the day its override lands on", () => {
    const result = applyExceptions(
      week(),
      [exc({ startAt: "2026-07-10T14:00:00Z", endAt: "2026-07-10T15:00:00Z" })],
      "UTC",
    )
    // Wednesday's occurrence is now on Friday, and Wednesday is empty.
    expect(result.filter((o) => o.date === "2026-07-08")).toHaveLength(0)
    const moved = result.filter((o) => o.date === "2026-07-10")
    expect(moved).toHaveLength(2) // Friday's own occurrence, plus the arrival
    expect(moved.some((o) => o.time === "14:00")).toBe(true)
    // The key it is found by is still the day the series would have produced it on.
    expect(moved.find((o) => o.time === "14:00")!.seriesEvent.id).toBe("evt-1")
  })

  it("keeps the key a moved occurrence is stored under", () => {
    // The point of tracking originalDate separately. Moving this occurrence again has
    // to update the row it already has; addressing it by where the block now sits
    // would write a SECOND override and leave the two fighting over the same day.
    const result = applyExceptions(
      week(),
      [exc({ startAt: "2026-07-10T14:00:00Z", endAt: "2026-07-10T15:00:00Z" })],
      "UTC",
    )
    const moved = result.find((o) => o.time === "14:00")!
    expect(moved.date).toBe("2026-07-10")
    expect(moved.originalDate).toBe("2026-07-08")
    expect(occurrenceKey(moved)).toBe("evt-1::2026-07-08")
  })

  it("carries a multi-day span with the occurrence when it moves", () => {
    const result = applyExceptions(
      week(),
      [exc({ startAt: "2026-07-09T14:00:00Z", endAt: "2026-07-11T15:00:00Z" })],
      "UTC",
    )
    const moved = result.find((o) => o.time === "14:00")!
    expect([moved.date, moved.endDate]).toEqual(["2026-07-09", "2026-07-11"])
  })

  it("leaves an inherited override where the series put it", () => {
    // The trap: a title-only override has no startAt of its own, so it inherits the
    // SERIES anchor's instant — whose date is 07-06. Reading that as a move would drag
    // every partial override back onto the anchor's day.
    const result = applyExceptions(week(), [exc({ title: "Renamed" })], "UTC")
    expect(result.find((o) => o.event.title === "Renamed")!.date).toBe(
      "2026-07-08",
    )
  })

  it("drops an occurrence that moved out of the view", () => {
    // Expanded inside the range, lands outside it. Nothing else can catch this:
    // expandOccurrences filtered on the natural date and never sees the override.
    const range = { start: "2026-07-06", end: "2026-07-11" }
    const result = applyExceptions(
      week(),
      [exc({ startAt: "2026-08-20T14:00:00Z", endAt: "2026-08-20T15:00:00Z" })],
      "UTC",
      range,
    )
    expect(dates(result)).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-09",
      "2026-07-10",
    ])
  })

  it("keeps a move that stays inside the view", () => {
    const range = { start: "2026-07-06", end: "2026-07-11" }
    const result = applyExceptions(
      week(),
      [exc({ startAt: "2026-07-10T14:00:00Z", endAt: "2026-07-10T15:00:00Z" })],
      "UTC",
      range,
    )
    expect(result).toHaveLength(5)
    expect(result.filter((o) => o.date === "2026-07-10")).toHaveLength(2)
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

describe("splitSeriesAt", () => {
  const RANGE = ["2026-07-01", "2026-11-01"] as const

  /** Everything the two halves produce together, in order. */
  function coverage(head: RecurringEvent, tail: RecurringEvent): string[] {
    return [
      ...dates(expandOccurrences(head, ...RANGE, "UTC")),
      ...dates(expandOccurrences(tail, ...RANGE, "UTC")),
    ].sort()
  }

  /** A tail anchored on the split date at the series' own time. */
  const anchoredOn = (date: string) => ({ startAt: `${date}T09:00:00Z` })

  it("covers exactly what the original did — no gap, no duplicate", () => {
    // The whole property in one assertion. Getting the inclusive end wrong by a day
    // shows up here as either a missing occurrence or one produced twice.
    const original = ev({
      startAt: "2026-07-01T09:00:00Z",
      recurrenceFreq: "weekly",
      recurrenceInterval: 2,
    })
    const before = dates(expandOccurrences(original, ...RANGE, "UTC"))
    const split = "2026-08-12" // the fourth occurrence
    expect(before).toContain(split)

    const { head, tail } = splitSeriesAt(original, split, anchoredOn(split))
    expect(coverage(head, tail)).toEqual(before)
  })

  it("gives the occurrence ON the split date to the tail", () => {
    const original = ev({
      startAt: "2026-07-01T09:00:00Z",
      recurrenceFreq: "weekly",
    })
    const split = "2026-07-15"
    const { head, tail } = splitSeriesAt(original, split, anchoredOn(split))
    expect(dates(expandOccurrences(head, ...RANGE, "UTC"))).not.toContain(split)
    expect(dates(expandOccurrences(tail, ...RANGE, "UTC"))[0]).toBe(split)
  })

  it("keeps the phase of an every-other-week series", () => {
    // Re-anchoring only works because the split date is itself an occurrence. If the
    // tail counted fortnights from anywhere else it would land on the off weeks.
    const original = ev({
      startAt: "2026-07-01T09:00:00Z",
      recurrenceFreq: "weekly",
      recurrenceInterval: 2,
    })
    const { tail } = splitSeriesAt(
      original,
      "2026-08-12",
      anchoredOn("2026-08-12"),
    )
    expect(dates(expandOccurrences(tail, ...RANGE, "UTC"))).toEqual([
      "2026-08-12",
      "2026-08-26",
      "2026-09-09",
      "2026-09-23",
      "2026-10-07",
      "2026-10-21",
    ])
  })

  it("keeps the phase of an every-third-month series", () => {
    const original = ev({
      startAt: "2026-01-15T09:00:00Z",
      recurrenceFreq: "monthly",
      recurrenceInterval: 3,
    })
    const { head, tail } = splitSeriesAt(
      original,
      "2026-07-15",
      anchoredOn("2026-07-15"),
    )
    expect(coverage(head, tail)).toEqual(
      dates(expandOccurrences(original, ...RANGE, "UTC")),
    )
    expect(
      dates(expandOccurrences(tail, "2026-07-01", "2027-01-01", "UTC")),
    ).toEqual(["2026-07-15", "2026-10-15"])
  })

  it("carries the series' own end date into the tail", () => {
    // The continuation inherits where the whole thing was always going to stop.
    const original = ev({
      startAt: "2026-07-01T09:00:00Z",
      recurrenceFreq: "weekly",
      recurrenceEndDate: "2026-08-19",
    })
    const { head, tail } = splitSeriesAt(
      original,
      "2026-07-29",
      anchoredOn("2026-07-29"),
    )
    expect(head.recurrenceEndDate).toBe("2026-07-28")
    expect(tail.recurrenceEndDate).toBe("2026-08-19")
    expect(coverage(head, tail)).toEqual(
      dates(expandOccurrences(original, ...RANGE, "UTC")),
    )
  })

  it("leaves the head empty when the split is the very first occurrence", () => {
    // "This and following" from the first day is really "all", and the caller is
    // expected to notice rather than write a series row that produces nothing.
    const original = ev({
      startAt: "2026-07-01T09:00:00Z",
      recurrenceFreq: "weekly",
    })
    const { head } = splitSeriesAt(
      original,
      "2026-07-01",
      anchoredOn("2026-07-01"),
    )
    expect(expandOccurrences(head, ...RANGE, "UTC")).toEqual([])
  })

  it("carries the edit into the tail and leaves the head alone", () => {
    const original = ev({
      startAt: "2026-07-01T09:00:00Z",
      recurrenceFreq: "weekly",
    })
    const { head, tail } = splitSeriesAt(original, "2026-07-15", {
      startAt: "2026-07-15T14:00:00Z",
      recurrenceInterval: 2,
    })
    expect(expandOccurrences(head, ...RANGE, "UTC")[0].time).toBe("09:00")
    const after = expandOccurrences(tail, ...RANGE, "UTC")
    expect(after[0].time).toBe("14:00")
    expect(dates(after).slice(0, 3)).toEqual([
      "2026-07-15",
      "2026-07-29",
      "2026-08-12",
    ])
  })
})

describe("overrideDate", () => {
  it("reads the day out of the override's own instant", () => {
    expect(overrideDate(exc({ startAt: "2026-07-10T14:00:00Z" }), "UTC")).toBe(
      "2026-07-10",
    )
  })

  it("is null when the override has no instant of its own", () => {
    // Not a move: this row inherits the series anchor's instant, whose date belongs to
    // the anchor rather than to this occurrence.
    expect(overrideDate(exc({ title: "Renamed" }), "UTC")).toBeNull()
  })

  it("reads the day in the viewer's zone, not UTC", () => {
    // 02:30Z on the 10th is still the 9th in Chicago, so that is the day it lands on.
    expect(
      overrideDate(exc({ startAt: "2026-07-10T02:30:00Z" }), "America/Chicago"),
    ).toBe("2026-07-09")
  })
})

describe("inboundOccurrenceDates", () => {
  const range = { start: "2026-07-06", end: "2026-07-11" }

  it("names the natural date of an occurrence moved in from outside", () => {
    // Its own day is 06-20, well outside the week — so expandOccurrences never produced
    // it, and without this the arrival on 07-08 simply would not be there.
    expect(
      inboundOccurrenceDates(
        [exc({ originalDate: "2026-06-20", startAt: "2026-07-08T14:00:00Z" })],
        range,
        "UTC",
      ),
    ).toEqual([{ eventId: "evt-1", date: "2026-06-20" }])
  })

  it("ignores an override that was already inside the view", () => {
    // Expanded normally; asking for it again would render it twice.
    expect(
      inboundOccurrenceDates(
        [exc({ originalDate: "2026-07-08", startAt: "2026-07-09T14:00:00Z" })],
        range,
        "UTC",
      ),
    ).toEqual([])
  })

  it("ignores an override that lands outside the view", () => {
    expect(
      inboundOccurrenceDates(
        [exc({ originalDate: "2026-06-20", startAt: "2026-08-01T14:00:00Z" })],
        range,
        "UTC",
      ),
    ).toEqual([])
  })

  it("ignores a skip, which has nowhere to arrive", () => {
    expect(
      inboundOccurrenceDates(
        [
          exc({
            originalDate: "2026-06-20",
            canceled: true,
            startAt: "2026-07-08T14:00:00Z",
          }),
        ],
        range,
        "UTC",
      ),
    ).toEqual([])
  })

  it("ignores an override with no instant of its own", () => {
    expect(
      inboundOccurrenceDates(
        [exc({ originalDate: "2026-06-20", title: "Renamed" })],
        range,
        "UTC",
      ),
    ).toEqual([])
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

describe("weekDates", () => {
  it("returns the seven days of the containing week, Sunday-started", () => {
    // 2026-07-15 is a Wednesday.
    expect(weekDates("2026-07-15")).toEqual([
      "2026-07-12",
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
    ])
  })

  it("honours weekStartsOn", () => {
    expect(weekDates("2026-07-15", 1)[0]).toBe("2026-07-13") // the Monday
  })

  it("straddles a month boundary, which is why gridRange cannot serve it", () => {
    expect(weekDates("2026-08-01")).toEqual([
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ])
  })

  it("returns the date itself first when it already starts the week", () => {
    expect(weekDates("2026-07-12")[0]).toBe("2026-07-12") // a Sunday
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
