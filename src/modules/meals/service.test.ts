import { describe, expect, it } from "vitest"

import {
  entryTotals,
  groupByMealType,
  macroProgress,
  sumMacros,
  type MealType,
} from "./service"

const entry = (
  over: Partial<{
    servings: number
    calories: number
    proteinG: number
    carbsG: number
    fatG: number
    mealType: MealType | null
  }> = {},
) => ({
  servings: 1,
  calories: 100,
  proteinG: 10,
  carbsG: 20,
  fatG: 5,
  mealType: null as MealType | null,
  ...over,
})

describe("entryTotals", () => {
  it("scales per-serving macros by servings (fractional ok)", () => {
    expect(entryTotals(entry({ servings: 1.5 }))).toEqual({
      calories: 150,
      protein: 15,
      carbs: 30,
      fat: 7.5,
    })
  })
})

describe("sumMacros", () => {
  it("sums across entries", () => {
    const totals = sumMacros([
      entry({ servings: 2 }), // 200 / 20 / 40 / 10
      entry({ calories: 50, proteinG: 5, carbsG: 0, fatG: 1 }), // 50 / 5 / 0 / 1
    ])
    expect(totals).toEqual({ calories: 250, protein: 25, carbs: 40, fat: 11 })
  })

  it("empty list → zeros", () => {
    expect(sumMacros([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })
})

describe("groupByMealType", () => {
  it("orders meals, omits empties, subtotals, buckets untagged as other", () => {
    const groups = groupByMealType([
      entry({ mealType: "dinner", calories: 300 }),
      entry({ mealType: "breakfast", calories: 100 }),
      entry({ mealType: null, calories: 40 }),
      entry({ mealType: "breakfast", calories: 200 }),
    ])
    expect(groups.map((g) => g.mealType)).toEqual(["breakfast", "dinner", "other"])
    expect(groups[0].entries).toHaveLength(2)
    expect(groups[0].totals.calories).toBe(300) // 100 + 200
    expect(groups[2].mealType).toBe("other")
  })
})

describe("macroProgress", () => {
  const totals = { calories: 1800, protein: 120, carbs: 150, fat: 60 }

  it("computes remaining + percent against targets", () => {
    const p = macroProgress(totals, {
      calories: 2000,
      proteinG: 150,
      carbsG: 200,
      fatG: 70,
    })
    expect(p.calories).toEqual({
      consumed: 1800,
      target: 2000,
      remaining: 200,
      percent: 90,
    })
    expect(p.protein.remaining).toBe(30)
  })

  it("no targets → null comparisons", () => {
    const p = macroProgress(totals, null)
    expect(p.calories).toEqual({
      consumed: 1800,
      target: null,
      remaining: null,
      percent: null,
    })
  })
})
