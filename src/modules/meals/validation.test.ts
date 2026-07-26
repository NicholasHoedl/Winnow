import { describe, expect, it } from "vitest"

import {
  bodyWeightSchema,
  restoreMealEntrySchema,
  restoreWaterLogSchema,
  waterLogSchema,
} from "./validation"

// These cover the undo payloads specifically. Every `restoreX` is a Server Action, so its
// parameter type is a compile-time annotation and nothing else — the browser can post
// whatever it likes. Budget's restoreTransaction was given a schema in T3-S11; T4-S14
// brought meals up to the same bar, and these are the properties that matters.

const entry = {
  id: "3f1b6b3e-1f9c-4f2a-9d2e-6b0f6a1c2d3e",
  foodId: null,
  date: "2026-07-25",
  mealType: "breakfast",
  servings: 1.5,
  name: "Greek Yogurt",
  servingLabel: "170 g",
  calories: 100,
  proteinG: 17,
  carbsG: 6,
  fatG: 0.7,
  fiberG: 0,
  sugarG: 4,
  satFatG: 0.2,
  sodiumMg: 61,
  createdAt: "2026-07-25T10:00:00.000Z",
}

describe("restore payload schemas", () => {
  it("accepts a well-formed entry and revives createdAt as a Date", () => {
    const parsed = restoreMealEntrySchema.parse(entry)
    // It crosses the RPC boundary as an ISO string; the column needs a Date.
    expect(parsed.createdAt).toBeInstanceOf(Date)
    expect(parsed.sodiumMg).toBe(61)
  })

  it("keeps a measured zero distinct from unknown", () => {
    const parsed = restoreMealEntrySchema.parse({
      ...entry,
      fiberG: 0,
      sugarG: null,
    })
    expect(parsed.fiberG).toBe(0)
    expect(parsed.sugarG).toBeNull()
  })

  it("REJECTS a payload with a micro column missing", () => {
    // The whole point. `microNumber` on the form schemas is `.optional()` because a form
    // may not render a field — but an absent key here would arrive as undefined, drizzle
    // would skip the column, and the restored row would come back with a silent NULL.
    // That is the data loss restore.ts exists to prevent, so it must not parse.
    const { sodiumMg, ...missing } = entry
    void sodiumMg
    expect(restoreMealEntrySchema.safeParse(missing).success).toBe(false)
  })

  it("drops a client-supplied userId instead of carrying it through", () => {
    const parsed = restoreMealEntrySchema.parse({ ...entry, userId: "someone" })
    expect(parsed).not.toHaveProperty("userId")
  })

  it("rejects a malformed date rather than letting Postgres reject it", () => {
    expect(
      restoreMealEntrySchema.safeParse({ ...entry, date: "" }).success,
    ).toBe(false)
    expect(
      restoreMealEntrySchema.safeParse({ ...entry, date: "2026-02-30" })
        .success,
    ).toBe(false)
  })

  it("holds undo to the same range as the original write", () => {
    // Otherwise undo is a way around the bounds: restore a 9000 fl oz log and the day's
    // total is nonsense, with no form ever having accepted it.
    const log = {
      id: "3f1b6b3e-1f9c-4f2a-9d2e-6b0f6a1c2d3e",
      date: "2026-07-25",
      amountFlOz: 9000,
      createdAt: "2026-07-25T10:00:00.000Z",
    }
    expect(restoreWaterLogSchema.safeParse(log).success).toBe(false)
    expect(
      waterLogSchema.safeParse({ date: log.date, amountFlOz: 9000 }).success,
    ).toBe(false)
  })
})

describe("bodyWeightSchema", () => {
  it("rejects a fat-fingered weight that would flatten the trend chart", () => {
    expect(
      bodyWeightSchema.safeParse({ date: "2026-07-25", weightLb: 1855 })
        .success,
    ).toBe(false)
    expect(
      bodyWeightSchema.safeParse({ date: "2026-07-25", weightLb: 0 }).success,
    ).toBe(false)
    expect(
      bodyWeightSchema.safeParse({ date: "2026-07-25", weightLb: 181.8 })
        .success,
    ).toBe(true)
  })
})
