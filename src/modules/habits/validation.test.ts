import { describe, expect, it } from "vitest"

import { habitInputSchema, logEntrySchema } from "./validation"

const VALID = { title: "Attend class", period: "week", targetCount: 3 }

describe("habitInputSchema", () => {
  it("accepts a rate", () => {
    const parsed = habitInputSchema.parse(VALID)
    expect(parsed).toMatchObject({
      title: "Attend class",
      period: "week",
      targetCount: 3,
      goalId: null,
    })
  })

  it("trims the title and rejects an empty one", () => {
    expect(habitInputSchema.parse({ ...VALID, title: "  Run  " }).title).toBe(
      "Run",
    )
    expect(habitInputSchema.safeParse({ ...VALID, title: "   " }).success).toBe(
      false,
    )
  })

  it("normalises every spelling of 'no goal' to null", () => {
    // "" is what an unset <Select> submits; the action should never have to know which.
    for (const goalId of ["", null, undefined]) {
      expect(habitInputSchema.parse({ ...VALID, goalId }).goalId).toBeNull()
    }
  })

  it("keeps a real goal id", () => {
    const goalId = "3f6c1b7e-0b1f-4a5e-8d3a-9c2b7e1f4a5e"
    expect(habitInputSchema.parse({ ...VALID, goalId }).goalId).toBe(goalId)
  })

  it("rejects a target that is not a whole count of at least one", () => {
    for (const targetCount of [0, -1, 1.5, 101]) {
      expect(
        habitInputSchema.safeParse({ ...VALID, targetCount }).success,
      ).toBe(false)
    }
  })

  it("rejects a cadence it does not have periods for", () => {
    expect(
      habitInputSchema.safeParse({ ...VALID, period: "year" }).success,
    ).toBe(false)
  })

  // The load-bearing test in this file, and it INVERTED for two of its fields when
  // measured habits shipped. `unit` and `targetAmount` were held out of this schema while
  // nothing read them, on the reasoning that a companion proposal setting
  // `targetAmount: 20` must not produce a habit reading "1 of 1 done" after a single
  // word. `tallyByPeriod` sums amounts now, so they are writable — and the four that
  // remain are the ones a client must never set at all.
  it("strips the fields the client must not set", () => {
    const parsed = habitInputSchema.parse({
      ...VALID,
      startDate: "2020-01-01",
      endDate: "2030-01-01",
      archivedAt: new Date(),
      sortOrder: 99,
    }) as Record<string, unknown>

    for (const field of ["startDate", "endDate", "archivedAt", "sortOrder"]) {
      expect(parsed[field]).toBeUndefined()
    }
  })

  it("takes a measured quota now that something reads it", () => {
    const parsed = habitInputSchema.parse({
      ...VALID,
      targetCount: 1,
      targetAmount: 20,
      unit: "words",
    })
    expect(parsed).toMatchObject({ targetAmount: 20, unit: "words" })
  })

  it("keeps a fractional amount, which the column is `real` for", () => {
    expect(
      habitInputSchema.parse({ ...VALID, targetAmount: 5.5, unit: "km" })
        .targetAmount,
    ).toBe(5.5)
  })

  it("leaves a session habit with neither", () => {
    const parsed = habitInputSchema.parse(VALID)
    expect(parsed.targetAmount).toBeNull()
    expect(parsed.unit).toBeNull()
  })

  it("normalises an emptied unit field to null", () => {
    for (const unit of ["", "   ", null, undefined]) {
      expect(habitInputSchema.parse({ ...VALID, unit }).unit).toBeNull()
    }
  })

  // Both or neither. `resolveQuota` decides a habit is measured from `targetAmount`
  // alone, so an amount with no unit reads "12 of 20" with no answer to "20 what", and a
  // unit with no amount is a word the app will never print.
  it("refuses an amount without a unit, and a unit without an amount", () => {
    expect(
      habitInputSchema.safeParse({ ...VALID, targetAmount: 20 }).success,
    ).toBe(false)
    expect(
      habitInputSchema.safeParse({ ...VALID, unit: "words" }).success,
    ).toBe(false)
  })

  it("puts each of those errors on a field the dialog can point at", () => {
    const noUnit = habitInputSchema.safeParse({ ...VALID, targetAmount: 20 })
    expect(noUnit.error?.issues[0].path).toEqual(["unit"])
    const noAmount = habitInputSchema.safeParse({ ...VALID, unit: "words" })
    expect(noAmount.error?.issues[0].path).toEqual(["targetAmount"])
  })

  it("rejects an amount that is zero, negative, or absurd", () => {
    for (const targetAmount of [0, -5, 1_000_001]) {
      expect(
        habitInputSchema.safeParse({ ...VALID, targetAmount, unit: "km" })
          .success,
      ).toBe(false)
    }
  })

  it("rejects a unit too long to fit a meter's caption", () => {
    expect(
      habitInputSchema.safeParse({
        ...VALID,
        targetAmount: 1,
        unit: "x".repeat(21),
      }).success,
    ).toBe(false)
  })
})

describe("logEntrySchema", () => {
  it("accepts nothing at all — the action resolves today itself", () => {
    expect(logEntrySchema.parse({}).onDate).toBeUndefined()
  })

  it("accepts an explicit backfill date", () => {
    expect(logEntrySchema.parse({ onDate: "2026-07-22" }).onDate).toBe(
      "2026-07-22",
    )
  })

  it("rejects a date that isn't one", () => {
    for (const onDate of ["2026-02-30", "22-07-2026", "tomorrow", ""]) {
      expect(logEntrySchema.safeParse({ onDate }).success).toBe(false)
    }
  })
})

describe("logEntrySchema — amount", () => {
  it("accepts an amount, for the measured variant", () => {
    expect(logEntrySchema.parse({ amount: 12 }).amount).toBe(12)
    expect(logEntrySchema.parse({ amount: 5.5 }).amount).toBe(5.5)
  })

  // Absent rather than null: a session log records no amount at all, and the action is
  // what refuses one against a habit that has no target to measure it against.
  it("leaves it undefined when nothing is logged against it", () => {
    expect(logEntrySchema.parse({}).amount).toBeUndefined()
  })

  it("rejects zero, a negative, and a typo-sized figure", () => {
    for (const amount of [0, -1, 1_000_001]) {
      expect(logEntrySchema.safeParse({ amount }).success).toBe(false)
    }
  })
})
