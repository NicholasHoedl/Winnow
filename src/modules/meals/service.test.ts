import { describe, expect, it } from "vitest"

import {
  entryTotals,
  type FoodOption,
  groupByMealType,
  macroProgress,
  parseMealQuickAdd,
  type RecentEntry,
  recentFrequentFoods,
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

const FOODS: FoodOption[] = [
  { id: "f-ban", name: "Banana", servingLabel: "1 medium", calories: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4 },
  { id: "f-roll", name: "Dinner Roll", servingLabel: "1 roll", calories: 120, proteinG: 4, carbsG: 20, fatG: 2 },
  { id: "f-chx", name: "Chicken Breast", servingLabel: "100 g", calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
]

describe("parseMealQuickAdd — explicit macros", () => {
  it("parses macros + a leading meal type, defaulting the name to that meal type", () => {
    expect(parseMealQuickAdd("lunch 600cal 40p 30c 10f", FOODS)).toEqual({
      name: "Lunch",
      servingLabel: "1 serving",
      calories: 600,
      proteinG: 40,
      carbsG: 30,
      fatG: 10,
      servings: 1,
      mealType: "lunch",
      foodId: "",
      saveToLibrary: false,
    })
  })

  it("keeps a real name and strips the leading meal type", () => {
    expect(parseMealQuickAdd("breakfast oatmeal 300cal 12p 40c 6f", FOODS)).toEqual({
      name: "oatmeal",
      servingLabel: "1 serving",
      calories: 300,
      proteinG: 12,
      carbsG: 40,
      fatG: 6,
      servings: 1,
      mealType: "breakfast",
      foodId: "",
      saveToLibrary: false,
    })
  })

  it("prefers explicit macros even when a food name is present", () => {
    expect(parseMealQuickAdd("chicken breast 300cal 50p", FOODS)).toEqual({
      name: "chicken breast",
      servingLabel: "1 serving",
      calories: 300,
      proteinG: 50,
      carbsG: 0,
      fatG: 0,
      servings: 1,
      mealType: "",
      foodId: "",
      saveToLibrary: false,
    })
  })

  it("defaults the name to 'Quick entry' when only macros are given", () => {
    expect(parseMealQuickAdd("300cal 20p", FOODS)?.name).toBe("Quick entry")
  })
})

describe("parseMealQuickAdd — library food match", () => {
  const banana = {
    name: "Banana",
    servingLabel: "1 medium",
    calories: 105,
    proteinG: 1.3,
    carbsG: 27,
    fatG: 0.4,
    servings: 2,
    mealType: "" as const,
    foodId: "f-ban",
    saveToLibrary: false,
  }

  it("matches a food and applies the quantity as servings (macros stay per-serving)", () => {
    expect(parseMealQuickAdd("banana x2", FOODS)).toEqual(banana)
    expect(parseMealQuickAdd("banana ×2", FOODS)).toEqual(banana)
    expect(parseMealQuickAdd("2x banana", FOODS)).toEqual(banana)
  })

  it("defaults servings to 1 and ignores a zero quantity", () => {
    expect(parseMealQuickAdd("banana", FOODS)?.servings).toBe(1)
    expect(parseMealQuickAdd("banana x0", FOODS)?.servings).toBe(1)
  })

  it("matches a multi-word food without stripping its meal-type-like first word", () => {
    expect(parseMealQuickAdd("dinner roll x2", FOODS)).toMatchObject({
      name: "Dinner Roll",
      foodId: "f-roll",
      servings: 2,
      mealType: "",
    })
  })

  it("strips a leading meal type on the second pass to reach the food", () => {
    expect(parseMealQuickAdd("lunch banana x2", FOODS)).toMatchObject({
      name: "Banana",
      foodId: "f-ban",
      servings: 2,
      mealType: "lunch",
    })
  })

  it("matches a food by a unique name prefix", () => {
    expect(parseMealQuickAdd("chicken", FOODS)).toMatchObject({
      name: "Chicken Breast",
      foodId: "f-chx",
      servings: 1,
    })
  })

  it("does not match an ambiguous prefix", () => {
    const ambiguous: FoodOption[] = [
      ...FOODS,
      { id: "f-thigh", name: "Chicken Thigh", servingLabel: "100 g", calories: 209, proteinG: 26, carbsG: 0, fatG: 11 },
    ]
    expect(parseMealQuickAdd("chicken", ambiguous)).toBeNull()
  })

  it("returns null when nothing matches and there are no macros", () => {
    expect(parseMealQuickAdd("pizza", FOODS)).toBeNull()
    expect(parseMealQuickAdd("snack", FOODS)).toBeNull()
    expect(parseMealQuickAdd("   ", FOODS)).toBeNull()
  })
})

const re = (
  over: Partial<RecentEntry> & Pick<RecentEntry, "name">,
): RecentEntry => ({
  foodId: null,
  servingLabel: "1 serving",
  calories: 100,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  ...over,
})

// Newest-first, as getRecentEntries returns. Banana logged 3x (i0/i2/i4), Chicken 1x,
// and "Oatmeal"/"oatmeal" twice (a case-insensitive merge with no foodId).
const RECENT: RecentEntry[] = [
  re({ name: "Banana", foodId: "f-ban", calories: 110 }),
  re({ name: "Chicken", foodId: "f-chx" }),
  re({ name: "Banana", foodId: "f-ban", calories: 105 }),
  re({ name: "Oatmeal", foodId: null }),
  re({ name: "Banana", foodId: "f-ban", calories: 105 }),
  re({ name: "oatmeal", foodId: null }),
]

describe("recentFrequentFoods", () => {
  it("ranks by combined frequency + recency", () => {
    const picks = recentFrequentFoods(RECENT)
    expect(picks.map((p) => p.name)).toEqual(["Banana", "Chicken", "Oatmeal"])
    expect(picks.map((p) => p.foodId)).toEqual(["f-ban", "f-chx", null])
  })

  it("carries the most-recent snapshot", () => {
    expect(recentFrequentFoods(RECENT)[0].calories).toBe(110)
  })

  it("dedupes by name (case-insensitive) when there is no foodId", () => {
    const picks = recentFrequentFoods(RECENT)
    expect(picks).toHaveLength(3)
    expect(picks.find((p) => p.foodId === null)?.name).toBe("Oatmeal")
  })

  it("caps the result", () => {
    expect(recentFrequentFoods(RECENT, 2).map((p) => p.name)).toEqual([
      "Banana",
      "Chicken",
    ])
  })

  it("returns empty for empty input", () => {
    expect(recentFrequentFoods([])).toEqual([])
  })
})
