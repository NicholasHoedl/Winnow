import { describe, expect, it } from "vitest"

import {
  bodyWeightSchema,
  logSavedMealSchema,
  restoreMealEntrySchema,
  restoreSavedMealSchema,
  restoreWaterLogSchema,
  savedMealInputSchema,
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

// --- Saved meals (T32) ---

const FOOD_ID = "0f2a6a4e-3d2e-4d0b-9c1a-6a1f5b3c2d10"
const MEAL_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
const ITEM_ID = "16fd2706-8baf-433b-82eb-8c7fada847da"

const item = {
  foodId: FOOD_ID,
  name: "Banana",
  servingLabel: "1 medium",
  calories: 105,
  proteinG: 1.3,
  carbsG: 27,
  fatG: 0.4,
  fiberG: 3.1,
  sugarG: 14,
  satFatG: null,
  sodiumMg: 1,
  servings: 1,
}

const input = {
  name: "Banana breakfast",
  mealType: "breakfast",
  items: [item],
}

describe("savedMealInputSchema", () => {
  it("accepts a named meal with at least one item, with or without an id", () => {
    const created = savedMealInputSchema.safeParse(input)
    expect(created.success).toBe(true)
    if (created.success) expect(created.data.id).toBeUndefined()

    const edited = savedMealInputSchema.safeParse({ ...input, id: MEAL_ID })
    expect(edited.success).toBe(true)
    expect(
      savedMealInputSchema.safeParse({ ...input, id: "nope" }).success,
    ).toBe(false)
  })

  it("refuses an empty meal, a blank name and a meal type it does not know", () => {
    expect(
      savedMealInputSchema.safeParse({ ...input, items: [] }).success,
    ).toBe(false)
    expect(
      savedMealInputSchema.safeParse({ ...input, name: "   " }).success,
    ).toBe(false)
    expect(
      savedMealInputSchema.safeParse({ ...input, mealType: "brunch" }).success,
    ).toBe(false)
    // "" is the meal that goes wherever quick-added meals go.
    expect(
      savedMealInputSchema.safeParse({ ...input, mealType: "" }).success,
    ).toBe(true)
  })

  it("requires every micro on an item — null is an answer, missing is not", () => {
    const { satFatG, ...missing } = item
    void satFatG
    expect(
      savedMealInputSchema.safeParse({ ...input, items: [missing] }).success,
    ).toBe(false)
    expect(
      savedMealInputSchema.safeParse({
        ...input,
        items: [{ ...item, foodId: null }],
      }).success,
    ).toBe(true)
  })

  it("bounds servings and the item count", () => {
    expect(
      savedMealInputSchema.safeParse({
        ...input,
        items: [{ ...item, servings: 0 }],
      }).success,
    ).toBe(false)
    const tooMany = Array.from({ length: 41 }, () => item)
    expect(
      savedMealInputSchema.safeParse({ ...input, items: tooMany }).success,
    ).toBe(false)
  })
})

describe("logSavedMealSchema", () => {
  it("needs a uuid and a real day", () => {
    expect(
      logSavedMealSchema.safeParse({ id: MEAL_ID, date: "2026-09-10" }).success,
    ).toBe(true)
    expect(
      logSavedMealSchema.safeParse({ id: "meal", date: "2026-09-10" }).success,
    ).toBe(false)
    expect(
      logSavedMealSchema.safeParse({ id: MEAL_ID, date: "2026-13-40" }).success,
    ).toBe(false)
  })
})

describe("restoreSavedMealSchema", () => {
  const deleted = {
    id: MEAL_ID,
    name: "Banana breakfast",
    mealType: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    items: [
      {
        id: ITEM_ID,
        savedMealId: MEAL_ID,
        foodId: null,
        position: 0,
        servings: 1.5,
        name: "Banana",
        servingLabel: "1 medium",
        calories: 105,
        proteinG: 1.3,
        carbsG: 27,
        fatG: 0.4,
        fiberG: 3.1,
        sugarG: 14,
        satFatG: null,
        sodiumMg: 1,
      },
    ],
  }

  it("round-trips a deleted meal with its items, coercing createdAt", () => {
    const parsed = restoreSavedMealSchema.safeParse(deleted)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.createdAt).toBeInstanceOf(Date)
    expect(parsed.data.items[0].position).toBe(0)
    expect(parsed.data.items[0].satFatG).toBeNull()
  })

  it("refuses an item missing a column, and never takes a userId", () => {
    const { sodiumMg, ...missing } = deleted.items[0]
    void sodiumMg
    expect(
      restoreSavedMealSchema.safeParse({ ...deleted, items: [missing] })
        .success,
    ).toBe(false)
    const parsed = restoreSavedMealSchema.safeParse({
      ...deleted,
      userId: "someone-else",
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).not.toHaveProperty("userId")
  })
})
