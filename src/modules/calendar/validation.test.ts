import { describe, expect, it } from "vitest"

import { MAX_MOVE_DAYS } from "./service"
import { rescheduleSchema } from "./validation"

// A Server Action is a public RPC endpoint, so this schema is the only thing standing
// between a posted payload and an exception row.
//
// The move limit is the case that matters most, and not for the usual reason. It isn't
// a taste judgement about how far a drag should reach — the calendar queries WIDEN their
// scan windows by exactly MAX_MOVE_DAYS to find occurrences that moved into a view. A
// move that slips past this bound lands somewhere no read will ever look for it, and the
// occurrence disappears from the calendar with the row still in the database.

const base = {
  originalDate: "2026-07-08",
  date: "2026-07-10",
  allDay: false,
  startTime: "14:00",
  endTime: "15:00",
}

describe("rescheduleSchema", () => {
  it("accepts a plain two-day move", () => {
    expect(rescheduleSchema.safeParse(base).success).toBe(true)
  })

  it("accepts an all-day move with no times", () => {
    const parsed = rescheduleSchema.safeParse({
      originalDate: "2026-07-08",
      date: "2026-07-10",
      allDay: true,
    })
    expect(parsed.success).toBe(true)
  })

  it("accepts an endDate, so a multi-day occurrence keeps its span", () => {
    const parsed = rescheduleSchema.parse({
      ...base,
      date: "2026-07-10",
      endDate: "2026-07-12",
    })
    expect(parsed.endDate).toBe("2026-07-12")
  })

  it("REJECTS a move beyond the limit the read windows are sized for", () => {
    const far = new Date("2026-07-08T00:00:00Z")
    far.setUTCDate(far.getUTCDate() + MAX_MOVE_DAYS + 1)
    const parsed = rescheduleSchema.safeParse({
      ...base,
      date: far.toISOString().slice(0, 10),
    })
    expect(parsed.success).toBe(false)
  })

  it("accepts a move at exactly the limit", () => {
    const edge = new Date("2026-07-08T00:00:00Z")
    edge.setUTCDate(edge.getUTCDate() + MAX_MOVE_DAYS)
    expect(
      rescheduleSchema.safeParse({
        ...base,
        date: edge.toISOString().slice(0, 10),
      }).success,
    ).toBe(true)
  })

  it("REJECTS a move backwards beyond the limit too", () => {
    // The bound is on distance, not direction: a drag can go either way, and the read
    // windows widen on both sides to match.
    const far = new Date("2026-07-08T00:00:00Z")
    far.setUTCDate(far.getUTCDate() - (MAX_MOVE_DAYS + 1))
    expect(
      rescheduleSchema.safeParse({
        ...base,
        date: far.toISOString().slice(0, 10),
      }).success,
    ).toBe(false)
  })

  it("REJECTS a timed move with no start time", () => {
    const parsed = rescheduleSchema.safeParse({
      ...base,
      startTime: undefined,
    })
    expect(parsed.success).toBe(false)
  })

  it("REJECTS an end before the start", () => {
    const parsed = rescheduleSchema.safeParse({
      ...base,
      date: "2026-07-10",
      endDate: "2026-07-09",
    })
    expect(parsed.success).toBe(false)
  })

  it("REJECTS a date that is not a date", () => {
    // It reaches Postgres as a comparison against a `date` column, so an unchecked
    // value is a crash rather than a clean rejection.
    expect(
      rescheduleSchema.safeParse({ ...base, date: "not-a-date" }).success,
    ).toBe(false)
    expect(
      rescheduleSchema.safeParse({ ...base, originalDate: "2026-02-30" })
        .success,
    ).toBe(false)
  })
})
