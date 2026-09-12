import { describe, expect, it } from "vitest"

import { newEventDate } from "./views"

/**
 * The date the header's "Add event" starts from (T36, Tesler).
 *
 * It was always `today`, so an event added while looking at next month opened dated this
 * one — and the date you meant was on screen the whole time. The budget's transaction
 * dialog has answered this since T3 ("today, or the first of the month being viewed");
 * this is the same rule for a view that can be a month, a week or a day.
 */
describe("newEventDate", () => {
  const WEEK = [
    "2026-09-06",
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
    "2026-09-10",
    "2026-09-11",
    "2026-09-12",
  ]

  it("is today when the days on screen include it", () => {
    expect(newEventDate("week", "2026-09-09", "2026-09-10", WEEK)).toBe(
      "2026-09-10",
    )
  })

  it("is the day being viewed when today is elsewhere", () => {
    expect(newEventDate("week", "2026-09-09", "2026-10-01", WEEK)).toBe(
      "2026-09-09",
    )
  })

  it("follows the day view's one column", () => {
    expect(
      newEventDate("day", "2027-03-04", "2026-09-10", ["2027-03-04"]),
    ).toBe("2027-03-04")
    expect(
      newEventDate("day", "2026-09-10", "2026-09-10", ["2026-09-10"]),
    ).toBe("2026-09-10")
  })

  // The month grid runs from the week the 1st falls in to the week the last day falls in,
  // so today can be on screen while belonging to the month either side of the one named.
  it("reads the month grid as drawn, not the month it is named after", () => {
    const grid = ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]
    expect(newEventDate("month", "2026-09-01", "2026-08-31", grid)).toBe(
      "2026-08-31",
    )
    expect(newEventDate("month", "2026-09-01", "2026-07-04", grid)).toBe(
      "2026-09-01",
    )
  })

  // The agenda draws no grid — it lists a month of events — so its question is whether
  // today falls in that month.
  it("judges the agenda by the month it is listing", () => {
    expect(newEventDate("agenda", "2026-09-01", "2026-09-24", [])).toBe(
      "2026-09-24",
    )
    expect(newEventDate("agenda", "2026-09-01", "2026-10-02", [])).toBe(
      "2026-09-01",
    )
  })
})
