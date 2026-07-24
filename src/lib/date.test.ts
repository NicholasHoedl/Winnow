import { describe, expect, it } from "vitest"

import {
  addDays,
  dayDiff,
  daysInMonth,
  dowOf,
  fmt,
  isValidDateString,
  todayInZone,
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
