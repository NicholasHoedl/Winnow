import { describe, expect, it } from "vitest"

import { currentCycle, type TaskRecurrenceRule } from "./recurrence"

// Minimal rule builder. Dates in July 2026 (2026-07-06 is a Monday) so weekday reasoning
// is easy to follow. weekStartsOn is passed explicitly per call.
function rule(over: Partial<TaskRecurrenceRule> = {}): TaskRecurrenceRule {
  return {
    freq: "daily",
    recurrenceInterval: 1,
    weekdays: 0,
    monthlyMode: "day_of_month",
    flexible: false,
    startDate: "2026-07-01",
    endDate: null,
    ...over,
  }
}

// Weekday bits (0=Sun..6=Sat), same convention as the calendar engine.
const WD = { SUN: 1, MON: 2, TUE: 4, WED: 8, THU: 16, FRI: 32, SAT: 64 }
const same = (d: string) => ({ occurrenceDate: d, dueDate: d })

describe("currentCycle — boundaries", () => {
  it("is null before the start date", () => {
    expect(currentCycle(rule({ startDate: "2026-08-01" }), "2026-07-23", 0)).toBeNull()
  })

  it("is null after the (inclusive) end date", () => {
    expect(
      currentCycle(rule({ endDate: "2026-07-20" }), "2026-07-23", 0),
    ).toBeNull()
  })

  it("still has a cycle on the end date itself", () => {
    expect(currentCycle(rule({ endDate: "2026-07-23" }), "2026-07-23", 0)).toEqual(
      same("2026-07-23"),
    )
  })

  it("has a cycle on the start date itself", () => {
    expect(currentCycle(rule({ startDate: "2026-07-23" }), "2026-07-23", 0)).toEqual(
      same("2026-07-23"),
    )
  })
})

describe("currentCycle — daily", () => {
  it("interval 1 → today's occurrence", () => {
    expect(currentCycle(rule({ freq: "daily" }), "2026-07-23", 0)).toEqual(
      same("2026-07-23"),
    )
  })

  it("interval 3 anchors to the series start", () => {
    // 07-01, 07-04, 07-07, …, 07-22, 07-25 → latest ≤ 07-23 is 07-22.
    expect(
      currentCycle(rule({ freq: "daily", recurrenceInterval: 3 }), "2026-07-23", 0),
    ).toEqual(same("2026-07-22"))
  })
})

describe("currentCycle — weekly (specific weekdays)", () => {
  const start = "2026-07-06" // a Monday

  it("every Monday → the most recent Monday", () => {
    expect(
      currentCycle(rule({ freq: "weekly", weekdays: WD.MON, startDate: start }), "2026-07-23", 0),
    ).toEqual(same("2026-07-20"))
  })

  it("Mon+Wed+Fri → the latest selected weekday ≤ today", () => {
    // Thu 07-23: this week's Mon 20 / Wed 22 / Fri 24 → latest ≤ 23 is Wed 22.
    expect(
      currentCycle(
        rule({ freq: "weekly", weekdays: WD.MON | WD.WED | WD.FRI, startDate: start }),
        "2026-07-23",
        0,
      ),
    ).toEqual(same("2026-07-22"))
  })

  it("on the occurrence day itself", () => {
    expect(
      currentCycle(rule({ freq: "weekly", weekdays: WD.MON, startDate: start }), "2026-07-20", 0),
    ).toEqual(same("2026-07-20"))
  })

  it("weekdays=0 falls back to the anchor weekday (legacy)", () => {
    // Start Wed 07-15 → repeats Wednesdays; latest Wed ≤ 07-23 is 07-22.
    expect(
      currentCycle(rule({ freq: "weekly", weekdays: 0, startDate: "2026-07-15" }), "2026-07-23", 0),
    ).toEqual(same("2026-07-22"))
  })

  it("is null before the first occurrence when the anchor is mid-week", () => {
    // Start Wed 07-08, repeats Mondays → first occurrence is Mon 07-13; nothing on 07-09.
    expect(
      currentCycle(rule({ freq: "weekly", weekdays: WD.MON, startDate: "2026-07-08" }), "2026-07-09", 0),
    ).toBeNull()
    expect(
      currentCycle(rule({ freq: "weekly", weekdays: WD.MON, startDate: "2026-07-08" }), "2026-07-13", 0),
    ).toEqual(same("2026-07-13"))
  })

  it("every other Tuesday skips off weeks and persists through them", () => {
    const biweekly = rule({ freq: "weekly", weekdays: WD.TUE, recurrenceInterval: 2, startDate: "2026-07-07" })
    // 07-07, 07-21, 08-04. On 07-23 → 07-21; still 07-21 in the off week (07-28).
    expect(currentCycle(biweekly, "2026-07-23", 0)).toEqual(same("2026-07-21"))
    expect(currentCycle(biweekly, "2026-07-28", 0)).toEqual(same("2026-07-21"))
  })
})

describe("currentCycle — monthly (specific)", () => {
  it("day-of-month → the latest matching day", () => {
    const r = rule({ freq: "monthly", startDate: "2026-01-15" })
    expect(currentCycle(r, "2026-07-23", 0)).toEqual(same("2026-07-15"))
    expect(currentCycle(r, "2026-07-10", 0)).toEqual(same("2026-06-15")) // before the 15th
  })

  it("the 31st skips months without a 31st", () => {
    // Jan 31, (no Feb 31), Mar 31, … → latest ≤ 04-15 is 03-31.
    expect(
      currentCycle(rule({ freq: "monthly", startDate: "2026-01-31" }), "2026-04-15", 0),
    ).toEqual(same("2026-03-31"))
  })

  it("interval 2 anchors and persists through off months", () => {
    const r = rule({ freq: "monthly", recurrenceInterval: 2, startDate: "2026-01-15" })
    expect(currentCycle(r, "2026-07-23", 0)).toEqual(same("2026-07-15")) // Jul is active
    expect(currentCycle(r, "2026-08-20", 0)).toEqual(same("2026-07-15")) // Aug off → Jul persists
  })

  it("nth_weekday: '3rd Monday' → latest third Monday", () => {
    // Jul 20 / Aug 17 / Sep 21 are the 3rd Mondays → latest ≤ 09-10 is Aug 17.
    expect(
      currentCycle(
        rule({ freq: "monthly", monthlyMode: "nth_weekday", startDate: "2026-07-20" }),
        "2026-09-10",
        0,
      ),
    ).toEqual(same("2026-08-17"))
  })

  it("nth_weekday: 'last Friday' tracks the last occurrence each month", () => {
    // Jul 31 / Aug 28 / Sep 25 are the last Fridays → latest ≤ 09-10 is Aug 28.
    expect(
      currentCycle(
        rule({ freq: "monthly", monthlyMode: "nth_weekday", startDate: "2026-07-31" }),
        "2026-09-10",
        0,
      ),
    ).toEqual(same("2026-08-28"))
  })
})

describe("currentCycle — flexible weekly (soft due at week end)", () => {
  it("Sunday-start week", () => {
    expect(
      currentCycle(rule({ freq: "weekly", flexible: true }), "2026-07-23", 0),
    ).toEqual({ occurrenceDate: "2026-07-19", dueDate: "2026-07-25" })
  })

  it("Monday-start week shifts both the key and the due date", () => {
    expect(
      currentCycle(rule({ freq: "weekly", flexible: true }), "2026-07-23", 1),
    ).toEqual({ occurrenceDate: "2026-07-20", dueDate: "2026-07-26" })
  })

  it("interval 2 is null in off weeks, present in active weeks", () => {
    const r = rule({ freq: "weekly", flexible: true, recurrenceInterval: 2, startDate: "2026-07-05" })
    expect(currentCycle(r, "2026-07-14", 0)).toBeNull() // week after the anchor week
    expect(currentCycle(r, "2026-07-21", 0)).toEqual({
      occurrenceDate: "2026-07-19",
      dueDate: "2026-07-25",
    })
  })
})

describe("currentCycle — flexible monthly (soft due at month end)", () => {
  it("due date is the last day of the month", () => {
    expect(
      currentCycle(rule({ freq: "monthly", flexible: true, startDate: "2026-03-10" }), "2026-07-23", 0),
    ).toEqual({ occurrenceDate: "2026-07-01", dueDate: "2026-07-31" })
  })

  it("handles February in leap and non-leap years", () => {
    expect(
      currentCycle(rule({ freq: "monthly", flexible: true, startDate: "2024-01-01" }), "2024-02-15", 0),
    ).toEqual({ occurrenceDate: "2024-02-01", dueDate: "2024-02-29" })
    expect(
      currentCycle(rule({ freq: "monthly", flexible: true, startDate: "2025-01-01" }), "2025-02-15", 0),
    ).toEqual({ occurrenceDate: "2025-02-01", dueDate: "2025-02-28" })
  })

  it("interval 2 is null in an off month", () => {
    expect(
      currentCycle(
        rule({ freq: "monthly", flexible: true, recurrenceInterval: 2, startDate: "2026-01-05" }),
        "2026-02-15",
        0,
      ),
    ).toBeNull()
  })
})
