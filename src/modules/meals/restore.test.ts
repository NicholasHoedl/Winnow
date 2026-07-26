import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import {
  NOT_RESTORED,
  restorableFood,
  restorableMacroTarget,
  restorableMealEntry,
  restorableWaterLog,
} from "./restore"
import { foods, macroTargets, mealEntries, waterLogs } from "./schema"

// The point of these two tests: they compare the restore payload against the SCHEMA, so
// adding a column without touching restore.ts fails here rather than silently losing
// data on undo. That has happened twice in this repo, so a spot-check on today's columns
// wouldn't be enough — the assertion has to be derived from the table itself.

const food = {
  id: "f-1",
  userId: "someone-else",
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
  barcode: "0894700010137",
  createdAt: new Date("2026-07-20T10:00:00Z"),
  updatedAt: new Date("2026-07-25T10:00:00Z"),
}

const entry = {
  ...food,
  foodId: "f-1",
  date: "2026-07-25",
  mealType: "breakfast" as const,
  servings: 1.5,
}

describe("restorableFood", () => {
  it("carries every column the table has", () => {
    const payload = restorableFood(food, "me")
    for (const column of Object.keys(getTableColumns(foods))) {
      if (NOT_RESTORED.has(column)) continue
      expect(payload, `missing column: ${column}`).toHaveProperty(column)
    }
  })

  it("preserves the micronutrients and the barcode", () => {
    const payload = restorableFood(food, "me")
    expect(payload.fiberG).toBe(0)
    expect(payload.sugarG).toBe(4)
    expect(payload.satFatG).toBe(0.2)
    expect(payload.sodiumMg).toBe(61)
    expect(payload.barcode).toBe("0894700010137")
  })

  it("keeps createdAt but takes userId from the session, not the row", () => {
    const payload = restorableFood(food, "me")
    expect(payload.createdAt).toEqual(food.createdAt)
    expect(payload.userId).toBe("me")
  })

  it("distinguishes a measured zero from unknown", () => {
    const payload = restorableFood({ ...food, fiberG: 0, sugarG: null }, "me")
    expect(payload.fiberG).toBe(0)
    expect(payload.sugarG).toBeNull()
  })
})

describe("restorableMealEntry", () => {
  it("carries every column the table has", () => {
    const payload = restorableMealEntry(entry, "me")
    for (const column of Object.keys(getTableColumns(mealEntries))) {
      if (NOT_RESTORED.has(column)) continue
      expect(payload, `missing column: ${column}`).toHaveProperty(column)
    }
  })

  it("preserves the snapshot, the series link and the meal type", () => {
    const payload = restorableMealEntry(entry, "me")
    expect(payload.servings).toBe(1.5)
    expect(payload.mealType).toBe("breakfast")
    expect(payload.foodId).toBe("f-1")
    expect(payload.sodiumMg).toBe(61)
    expect(payload.date).toBe("2026-07-25")
  })

  it("keeps a null meal type null rather than defaulting it", () => {
    const payload = restorableMealEntry({ ...entry, mealType: null }, "me")
    expect(payload.mealType).toBeNull()
  })
})

describe("restorableWaterLog", () => {
  const log = {
    id: "w-1",
    userId: "someone-else",
    date: "2026-07-25",
    amountFlOz: 16,
    createdAt: new Date("2026-07-25T14:00:00Z"),
  }

  it("carries every column the table has", () => {
    const payload = restorableWaterLog(log, "me")
    for (const column of Object.keys(getTableColumns(waterLogs))) {
      if (NOT_RESTORED.has(column)) continue
      expect(payload, `missing column: ${column}`).toHaveProperty(column)
    }
  })

  it("puts the same amount back on the same day, under the session user", () => {
    const payload = restorableWaterLog(log, "me")
    expect(payload.amountFlOz).toBe(16)
    expect(payload.date).toBe("2026-07-25")
    expect(payload.createdAt).toEqual(log.createdAt)
    expect(payload.userId).toBe("me")
  })
})

describe("restorableMacroTarget", () => {
  const target = {
    id: "t-1",
    userId: "someone-else",
    effectiveFrom: "2026-03-01",
    calories: 2200,
    proteinG: 165,
    carbsG: 220,
    fatG: 70,
    createdAt: new Date("2026-03-01T08:00:00Z"),
    updatedAt: new Date("2026-03-02T08:00:00Z"),
  }

  it("carries every column the table has", () => {
    const payload = restorableMacroTarget(target, "me")
    for (const column of Object.keys(getTableColumns(macroTargets))) {
      if (NOT_RESTORED.has(column)) continue
      expect(payload, `missing column: ${column}`).toHaveProperty(column)
    }
  })

  it("keeps the period's start date — the whole point of the row", () => {
    const payload = restorableMacroTarget(target, "me")
    expect(payload.effectiveFrom).toBe("2026-03-01")
    expect(payload.calories).toBe(2200)
    expect(payload.userId).toBe("me")
  })
})
