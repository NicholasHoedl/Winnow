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

  // The load-bearing test in this file. These four columns exist on the table and nothing
  // reads them yet (`unit`/`targetAmount`) or should ever take them from a client
  // (`startDate`/`endDate`). Their absence from the schema is what enforces that — a
  // companion proposal in T12c setting `targetAmount: 20` must not produce a habit that
  // reads "1 of 1 done" after a single word.
  it("strips the fields nothing reads and the client must not set", () => {
    const parsed = habitInputSchema.parse({
      ...VALID,
      unit: "words",
      targetAmount: 20,
      startDate: "2020-01-01",
      endDate: "2030-01-01",
      archivedAt: new Date(),
      sortOrder: 99,
    }) as Record<string, unknown>

    for (const field of [
      "unit",
      "targetAmount",
      "startDate",
      "endDate",
      "archivedAt",
      "sortOrder",
    ]) {
      expect(parsed[field]).toBeUndefined()
    }
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

  // Same reasoning as the habit schema: `amount` pairs with `targetAmount`, and nothing
  // reads either yet.
  it("strips amount", () => {
    const parsed = logEntrySchema.parse({ amount: 5 }) as Record<
      string,
      unknown
    >
    expect(parsed.amount).toBeUndefined()
  })
})
