import { describe, expect, it } from "vitest"

import { parseNaturalDate } from "./nl-date"

// Anchor every case to a fixed "today" so the expected dates are stable.
// 2026-07-24 is a Friday (dowOf === 5, per date.test.ts), which lets the
// weekday cases exercise both "today counts" and "skip to next week".
const TODAY = "2026-07-24"

function date(text: string): string | null {
  return parseNaturalDate(text, TODAY).date
}

describe("parseNaturalDate — relative words", () => {
  it("resolves today / tonight to today", () => {
    expect(date("submit today")).toBe("2026-07-24")
    expect(date("dinner tonight")).toBe("2026-07-24")
  })

  it("resolves tomorrow (and common typos) to +1 day", () => {
    expect(date("call mom tomorrow")).toBe("2026-07-25")
    expect(date("call mom tmrw")).toBe("2026-07-25")
    expect(date("call mom tmr")).toBe("2026-07-25")
    expect(date("call mom tomorow")).toBe("2026-07-25")
  })

  it("prefers 'day after tomorrow' over the bare 'tomorrow' inside it", () => {
    expect(date("ship it day after tomorrow")).toBe("2026-07-26")
  })

  it("resolves yesterday to -1 day", () => {
    expect(date("logged yesterday")).toBe("2026-07-23")
  })

  it("resolves 'next week' to +7 days", () => {
    expect(date("review next week")).toBe("2026-07-31")
  })

  it("resolves 'in N days' / 'in N weeks'", () => {
    expect(date("in 1 day")).toBe("2026-07-25")
    expect(date("finish in 3 days")).toBe("2026-07-27")
    expect(date("vacation in 2 weeks")).toBe("2026-08-07")
  })
})

describe("parseNaturalDate — weekdays", () => {
  it("bare weekday resolves to the coming occurrence (today counts)", () => {
    // From Friday: Monday is +3, Sunday is +2, and Friday itself is today.
    expect(date("gym monday")).toBe("2026-07-27")
    expect(date("brunch sunday")).toBe("2026-07-26")
    expect(date("standup friday")).toBe("2026-07-24")
  })

  it("'this/on/by/due <weekday>' also lands on the coming occurrence", () => {
    expect(date("meet this friday")).toBe("2026-07-24")
    expect(date("call on monday")).toBe("2026-07-27")
    expect(date("pay by tuesday")).toBe("2026-07-28")
    expect(date("report due friday")).toBe("2026-07-24")
  })

  it("'next <weekday>' pushes a week out when today is that weekday", () => {
    // Today IS Friday, so "next friday" must skip to the following week.
    expect(date("demo next friday")).toBe("2026-07-31")
    // "next monday" from Friday is still the upcoming Monday.
    expect(date("kickoff next monday")).toBe("2026-07-27")
  })

  it("accepts common weekday abbreviations", () => {
    expect(date("call weds")).toBe("2026-07-29") // Wednesday = +5 from Fri
    expect(date("call thurs")).toBe("2026-07-30")
  })
})

describe("parseNaturalDate — explicit dates", () => {
  it("parses month-name forms in this year", () => {
    expect(date("trip aug 5")).toBe("2026-08-05")
    expect(date("trip august 5th")).toBe("2026-08-05")
    expect(date("trip 5 aug")).toBe("2026-08-05")
    expect(date("trip 5th of august")).toBe("2026-08-05")
  })

  it("rolls a past month/day into next year", () => {
    // Jan 1 has already passed relative to 2026-07-24.
    expect(date("resolution jan 1")).toBe("2027-01-01")
  })

  it("parses numeric M/D and M/D/YY(YY)", () => {
    expect(date("pay 8/5")).toBe("2026-08-05")
    expect(date("pay 8/5/27")).toBe("2027-08-05")
    expect(date("pay 12/25/2026")).toBe("2026-12-25")
  })

  it("parses an explicit ISO date", () => {
    expect(date("release 2026-08-15")).toBe("2026-08-15")
  })
})

describe("parseNaturalDate — no match / invalid", () => {
  it("returns null and the trimmed text when there is no date", () => {
    expect(parseNaturalDate("buy milk", TODAY)).toEqual({
      date: null,
      cleaned: "buy milk",
    })
    expect(parseNaturalDate("  buy milk  ", TODAY)).toEqual({
      date: null,
      cleaned: "buy milk",
    })
  })

  it("ignores impossible calendar dates", () => {
    expect(date("weird 2/30")).toBeNull() // Feb 30
    expect(date("weird 13/40")).toBeNull() // month/day overflow
    expect(date("weird 2026-02-30")).toBeNull() // impossible ISO
  })
})

describe("parseNaturalDate — cleaned text", () => {
  it("strips the date phrase and preserves the original casing of the rest", () => {
    expect(parseNaturalDate("Call Mom Tomorrow", TODAY)).toEqual({
      date: "2026-07-25",
      cleaned: "Call Mom",
    })
  })

  it("collapses the gap left by a mid-sentence date phrase", () => {
    expect(parseNaturalDate("email boss tomorrow about report", TODAY)).toEqual({
      date: "2026-07-25",
      cleaned: "email boss about report",
    })
  })

  it("swallows a dangling preposition before the date", () => {
    expect(parseNaturalDate("call mom on friday", TODAY)).toEqual({
      date: "2026-07-24",
      cleaned: "call mom",
    })
    expect(parseNaturalDate("pay rent by monday", TODAY)).toEqual({
      date: "2026-07-27",
      cleaned: "pay rent",
    })
    expect(parseNaturalDate("submit report by 8/5", TODAY)).toEqual({
      date: "2026-08-05",
      cleaned: "submit report",
    })
  })

  it("leaves text untouched when only a date is present", () => {
    expect(parseNaturalDate("tomorrow", TODAY)).toEqual({
      date: "2026-07-25",
      cleaned: "",
    })
  })
})
