import { describe, expect, it } from "vitest"

import {
  addDays,
  dateRange,
  dayDiff,
  daysInMonth,
  dowOf,
  dueStatus,
  fmt,
  isValidDateString,
  localDateToString,
  localStringToDate,
  monthSeries,
  shiftMonth,
  todayInZone,
  weekRange,
} from "./date"

const TZ = "America/Chicago"

describe("todayInZone", () => {
  it("returns the Chicago wall-date, not the UTC date", () => {
    // 2026-07-22T02:00Z is still 2026-07-21 (21:00 CDT) in Chicago.
    expect(todayInZone(new Date("2026-07-22T02:00:00Z"), TZ)).toBe("2026-07-21")
  })

  it("handles the Chicago midnight boundary in summer (CDT = UTC-5)", () => {
    expect(todayInZone(new Date("2026-07-21T04:59:00Z"), TZ)).toBe("2026-07-20")
    expect(todayInZone(new Date("2026-07-21T05:00:00Z"), TZ)).toBe("2026-07-21")
  })

  it("handles the Chicago midnight boundary in winter (CST = UTC-6)", () => {
    // DST offset differs from summer — proves Intl applies the right rule.
    expect(todayInZone(new Date("2026-01-15T05:59:00Z"), TZ)).toBe("2026-01-14")
    expect(todayInZone(new Date("2026-01-15T06:00:00Z"), TZ)).toBe("2026-01-15")
  })
})

describe("isValidDateString", () => {
  it("accepts real calendar dates", () => {
    expect(isValidDateString("2026-07-21")).toBe(true)
    expect(isValidDateString("2024-02-29")).toBe(true) // leap day
  })

  it("rejects malformed or impossible dates", () => {
    expect(isValidDateString("2026-13-40")).toBe(false) // month/day overflow
    expect(isValidDateString("2026-02-30")).toBe(false) // Feb 30
    expect(isValidDateString("2025-02-29")).toBe(false) // not a leap year
    expect(isValidDateString("2026-7-1")).toBe(false) // wrong format
    expect(isValidDateString("garbage")).toBe(false)
  })
})

describe("date-string primitives", () => {
  it("addDays crosses month/year boundaries (incl. leap)", () => {
    expect(addDays("2026-07-21", 1)).toBe("2026-07-22")
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01")
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29")
  })

  it("dayDiff counts whole days (b - a)", () => {
    expect(dayDiff("2026-07-21", "2026-07-24")).toBe(3)
    expect(dayDiff("2026-07-24", "2026-07-21")).toBe(-3)
    expect(dayDiff("2025-12-31", "2026-01-01")).toBe(1)
  })

  it("daysInMonth handles February + leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })

  it("dowOf returns 0=Sun .. 6=Sat", () => {
    expect(dowOf("2026-07-19")).toBe(0) // Sunday
    expect(dowOf("2026-07-20")).toBe(1) // Monday
    expect(dowOf("2026-07-24")).toBe(5) // Friday
  })

  it("fmt zero-pads month + day", () => {
    expect(fmt(2026, 7, 5)).toBe("2026-07-05")
    expect(fmt(2026, 12, 25)).toBe("2026-12-25")
  })
})

describe("weekRange", () => {
  // 2026-07-19 is a Sunday, so 07-22 is the Wednesday of that week.
  it("brackets a midweek date, Sunday-start", () => {
    expect(weekRange("2026-07-22", 0)).toEqual({
      start: "2026-07-19",
      end: "2026-07-25",
    })
  })

  it("shifts the whole window for Monday-start", () => {
    expect(weekRange("2026-07-22", 1)).toEqual({
      start: "2026-07-20",
      end: "2026-07-26",
    })
  })

  it("defaults to Sunday-start", () => {
    expect(weekRange("2026-07-22")).toEqual(weekRange("2026-07-22", 0))
  })

  it("includes the first and last day of the week itself", () => {
    expect(weekRange("2026-07-19", 0).start).toBe("2026-07-19") // Sunday
    expect(weekRange("2026-07-25", 0).end).toBe("2026-07-25") // Saturday
  })

  // The case the +7 in the modulo exists for: a Sunday under Monday-start belongs to
  // the week that began the PREVIOUS Monday, not the one starting the next day.
  it("puts a Sunday in the preceding week when weeks start Monday", () => {
    expect(weekRange("2026-07-19", 1)).toEqual({
      start: "2026-07-13",
      end: "2026-07-19",
    })
  })

  it("crosses the year boundary", () => {
    // 2026-01-01 is a Thursday.
    expect(weekRange("2026-01-01", 0)).toEqual({
      start: "2025-12-28",
      end: "2026-01-03",
    })
  })
})

describe("local Date <-> string (date pickers)", () => {
  it("localDateToString uses local wall-date fields, not UTC", () => {
    // A local-midnight Date must map to its own day regardless of the runner's timezone
    // (toISOString would shift it east of UTC).
    expect(localDateToString(new Date(2026, 6, 5))).toBe("2026-07-05") // month is 0-indexed
    expect(localDateToString(new Date(2026, 11, 25))).toBe("2026-12-25")
  })

  it("localStringToDate builds a local-midnight Date", () => {
    const d = localStringToDate("2026-07-05")
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6) // July, 0-indexed
    expect(d.getDate()).toBe(5)
  })

  it("round-trips a date string", () => {
    expect(localDateToString(localStringToDate("2026-02-28"))).toBe(
      "2026-02-28",
    )
  })
})

describe("shiftMonth", () => {
  it("moves forward and back within a year", () => {
    expect(shiftMonth("2026-07", 1)).toBe("2026-08")
    expect(shiftMonth("2026-07", -1)).toBe("2026-06")
    expect(shiftMonth("2026-07", 0)).toBe("2026-07")
  })

  it("rolls the year over in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01")
    expect(shiftMonth("2026-01", -1)).toBe("2025-12")
    expect(shiftMonth("2026-03", -14)).toBe("2025-01")
  })
})

describe("monthSeries", () => {
  it("ends at the given month and runs oldest first", () => {
    expect(monthSeries("2026-07", 3)).toEqual(["2026-05", "2026-06", "2026-07"])
  })

  it("crosses the year boundary", () => {
    expect(monthSeries("2026-02", 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ])
  })

  it("handles the degenerate lengths", () => {
    expect(monthSeries("2026-07", 1)).toEqual(["2026-07"])
    expect(monthSeries("2026-07", 0)).toEqual([])
  })
})

// Moved here from todos/service.test.ts in T5a, with the function itself.
describe("dueStatus", () => {
  const now = new Date("2026-07-21T12:00:00Z") // Chicago today = 2026-07-21

  it("treats null/undefined as none", () => {
    expect(dueStatus(null, now, TZ)).toBe("none")
    expect(dueStatus(undefined, now, TZ)).toBe("none")
  })

  it("classifies past/today/future", () => {
    expect(dueStatus("2026-07-20", now, TZ)).toBe("overdue")
    expect(dueStatus("2026-07-21", now, TZ)).toBe("due-today")
    expect(dueStatus("2026-07-22", now, TZ)).toBe("upcoming")
  })

  it("uses the configured zone, not UTC (late-evening Chicago)", () => {
    // 2026-07-22T02:00Z: UTC date is 07-22, but Chicago is still 07-21.
    const lateNow = new Date("2026-07-22T02:00:00Z")
    expect(dueStatus("2026-07-21", lateNow, TZ)).toBe("due-today") // not overdue
    expect(dueStatus("2026-07-22", lateNow, TZ)).toBe("upcoming")
  })

  it("crosses the year boundary correctly", () => {
    const newYear = new Date("2027-01-01T12:00:00Z") // Chicago 2027-01-01
    expect(dueStatus("2026-12-31", newYear, TZ)).toBe("overdue")
    expect(dueStatus("2027-01-01", newYear, TZ)).toBe("due-today")
  })
})

// Moved here from `todos/habits.test.ts` in T12a, unchanged, when the habits module
// stopped being derived from the recurrence engine and `dateRange` came with it.
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
