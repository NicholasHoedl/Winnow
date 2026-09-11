import { describe, expect, it } from "vitest"

import { addDays } from "@/lib/date"
import {
  carbsForCalories,
  entryTotals,
  macroCalories,
  type FoodOption,
  groupByMealType,
  isLikelyBarcode,
  itemFromFood,
  itemsFromEntries,
  macroProgress,
  parseMealQuickAdd,
  parseQuickAddFallback,
  rankLibraryFoods,
  type RecentEntry,
  recentFrequentFoods,
  resolveSavedMealItems,
  sumMacros,
  sumMicros,
  targetsForDate,
  weightGoalPhrase,
  weightReadout,
  weightTrend,
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
    expect(groups.map((g) => g.mealType)).toEqual([
      "breakfast",
      "dinner",
      "other",
    ])
    expect(groups[0].entries).toHaveLength(2)
    expect(groups[0].totals.calories).toBe(300) // 100 + 200
    expect(groups[2].mealType).toBe("other")
  })
})

describe("carbsForCalories", () => {
  it("solves for carbs as the balancing term", () => {
    // 2000 = 150*4 + c*4 + 60*9  ->  c = (2000 - 600 - 540) / 4 = 215
    expect(
      carbsForCalories({ calories: 2000, proteinG: 150, fatG: 60 }),
    ).toEqual({ kind: "fits", carbsG: 215 })
  })

  // Each of the three independently, because "skipped" is the rule that keeps "I only
  // track protein" expressible — a single combined case would pass even if two of the
  // three guards were missing.
  it.each([
    ["calories", { calories: 0, proteinG: 150, fatG: 60 }],
    ["protein", { calories: 2000, proteinG: 0, fatG: 60 }],
    ["fat", { calories: 2000, proteinG: 150, fatG: 0 }],
  ])("skips when %s is zero", (_which, target) => {
    expect(carbsForCalories(target)).toEqual({ kind: "skipped" })
  })

  it("reports the overshoot when protein and fat alone exceed the calories", () => {
    // 200*4 + 100*9 = 1700, against a 1500 target -> 200 kcal over.
    expect(
      carbsForCalories({ calories: 1500, proteinG: 200, fatG: 100 }),
    ).toEqual({ kind: "overshoot", byKcal: 200 })
  })

  it("treats an exact fit as fits, not overshoot", () => {
    // The boundary: protein and fat account for every calorie, so carbs is 0 — which is a
    // real answer, not a failure. Getting this wrong would reject a legitimate zero-carb
    // target with a message about overshooting by nothing.
    expect(
      carbsForCalories({ calories: 1700, proteinG: 200, fatG: 100 }),
    ).toEqual({ kind: "fits", carbsG: 0 })
  })

  it("produces a split that adds back up to the target", () => {
    // The property the whole feature exists for, asserted directly rather than inferred
    // from the arithmetic above: feed the derived carbs back through `macroCalories` and
    // the total must land on the target. Within half a kcal, because the 1dp rounding
    // makes exact equality unavailable by construction.
    const target = { calories: 2000, proteinG: 150, fatG: 70 }
    const fit = carbsForCalories(target)
    expect(fit.kind).toBe("fits")
    if (fit.kind !== "fits") return
    expect(macroCalories({ ...target, carbsG: fit.carbsG })).toBeCloseTo(
      target.calories,
      0,
    )
  })

  it("rounds to one decimal rather than to whole grams", () => {
    // (2001 - 600 - 540) / 4 = 215.25 -> 215.3. Whole grams would drop up to 4 kcal, which
    // is the drift this whole feature exists to remove.
    expect(
      carbsForCalories({ calories: 2001, proteinG: 150, fatG: 60 }),
    ).toEqual({ kind: "fits", carbsG: 215.3 })
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
  {
    id: "f-ban",
    name: "Banana",
    servingLabel: "1 medium",
    calories: 105,
    proteinG: 1.3,
    carbsG: 27,
    fatG: 0.4,
  },
  {
    id: "f-roll",
    name: "Dinner Roll",
    servingLabel: "1 roll",
    calories: 120,
    proteinG: 4,
    carbsG: 20,
    fatG: 2,
  },
  {
    id: "f-chx",
    name: "Chicken Breast",
    servingLabel: "100 g",
    calories: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
  },
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
    expect(
      parseMealQuickAdd("breakfast oatmeal 300cal 12p 40c 6f", FOODS),
    ).toEqual({
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

describe("parseMealQuickAdd — a macro token must be a whole word", () => {
  it("does not read macros out of the middle of a name", () => {
    // The regression this guards: the macro patterns ended at a word boundary but did not
    // start at one, so `abc278c` matched `278c` from inside the name and logged 278 carbs
    // while losing that part of the name. Above 100000 the action rejected the whole entry
    // with "Please fix the errors below.", which reads exactly like a dropped entry.
    // `null` is the right answer, and it is the improvement. A name with no macro token in
    // it and no library match is genuinely unparseable, so the quick-add says so — where
    // before it silently logged 278 carbs under a mangled name. An explicit "couldn't parse
    // that" is recoverable; a wrong entry you did not notice is not.
    expect(parseMealQuickAdd("abc278c", FOODS)).toBeNull()
  })

  it("still reads a macro that IS a whole word", () => {
    // The other half: the fix must not cost the feature it guards.
    const parsed = parseMealQuickAdd("snack 200cal 12p 8c 3f", FOODS)
    expect(parsed).toMatchObject({
      calories: 200,
      proteinG: 12,
      carbsG: 8,
      fatG: 3,
    })
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
      {
        id: "f-thigh",
        name: "Chicken Thigh",
        servingLabel: "100 g",
        calories: 209,
        proteinG: 26,
        carbsG: 0,
        fatG: 11,
      },
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
  fiberG: null,
  sugarG: null,
  satFatG: null,
  sodiumMg: null,
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

describe("sumMicros", () => {
  const me = (
    over: Partial<{
      servings: number
      fiberG: number | null
      sugarG: number | null
      satFatG: number | null
      sodiumMg: number | null
    }> = {},
  ) => ({
    servings: 1,
    fiberG: null as number | null,
    sugarG: null as number | null,
    satFatG: null as number | null,
    sodiumMg: null as number | null,
    ...over,
  })

  it("scales by servings and sums only what's present", () => {
    const { totals, known } = sumMicros([
      me({ servings: 2, fiberG: 3, sodiumMg: 100 }),
      me({ fiberG: 1.5, sugarG: 8 }),
    ])
    expect(totals.fiber).toBe(7.5) // 3×2 + 1.5
    expect(totals.sodium).toBe(200)
    expect(totals.sugar).toBe(8)
    expect(known.fiber).toBe(2)
    expect(known.sodium).toBe(1)
  })

  // The whole reason this isn't folded into sumMacros: a micro nobody measured has no
  // total, and reporting 0 would claim a measurement that was never taken.
  it("leaves a micro null when NO entry carried it", () => {
    const { totals, known } = sumMicros([me({ fiberG: 3 }), me({ fiberG: 1 })])
    expect(totals.fiber).toBe(4)
    expect(totals.satFat).toBeNull()
    expect(known.satFat).toBe(0)
  })

  it("distinguishes a measured zero from unknown", () => {
    const { totals, known } = sumMicros([me({ sodiumMg: 0 })])
    expect(totals.sodium).toBe(0)
    expect(known.sodium).toBe(1)
  })

  it("reports how many of how many, so the UI can qualify the number", () => {
    const result = sumMicros([
      me({ sodiumMg: 50 }),
      me(),
      me({ sodiumMg: 25 }),
      me(),
    ])
    expect(result.known.sodium).toBe(2)
    expect(result.total).toBe(4)
  })

  it("rounds away float noise", () => {
    // 0.7 × 3 is 2.0999999999999996 in IEEE754.
    expect(sumMicros([me({ servings: 3, fiberG: 0.7 })]).totals.fiber).toBe(2.1)
  })

  it("empty input → all null, nothing known", () => {
    const { totals, known, total } = sumMicros([])
    expect(totals).toEqual({
      fiber: null,
      sugar: null,
      sodium: null,
      satFat: null,
    })
    expect(known.fiber).toBe(0)
    expect(total).toBe(0)
  })
})

describe("isLikelyBarcode", () => {
  it("accepts the retail symbologies", () => {
    expect(isLikelyBarcode("12345678")).toBe(true) // EAN-8
    expect(isLikelyBarcode("038000138416")).toBe(true) // UPC-A
    expect(isLikelyBarcode("3017620422003")).toBe(true) // EAN-13
    expect(isLikelyBarcode("12345678901234")).toBe(true) // ITF-14
  })

  it("tolerates surrounding whitespace from a paste", () => {
    expect(isLikelyBarcode("  3017620422003 ")).toBe(true)
  })

  it("rejects lengths outside the retail range", () => {
    expect(isLikelyBarcode("1234567")).toBe(false)
    expect(isLikelyBarcode("123456789012345")).toBe(false)
    expect(isLikelyBarcode("")).toBe(false)
  })

  // This is the security-relevant half: the value reaches a URL path segment.
  it("rejects anything that isn't purely digits", () => {
    expect(isLikelyBarcode("../../etc/passwd")).toBe(false)
    expect(isLikelyBarcode("3017620422003/../x")).toBe(false)
    expect(isLikelyBarcode("301762042200x")).toBe(false)
    expect(isLikelyBarcode("3017-6204-2200")).toBe(false)
    expect(isLikelyBarcode("30176204220 3")).toBe(false)
  })
})

describe("parseQuickAddFallback", () => {
  it("hands over the name with the quantity and meal-type word stripped", () => {
    expect(parseQuickAddFallback("banana x2")).toEqual({
      query: "banana",
      servings: 2,
      mealType: "",
    })
    expect(parseQuickAddFallback("lunch 2x chicken breast")).toEqual({
      query: "chicken breast",
      servings: 2,
      mealType: "lunch",
    })
    expect(parseQuickAddFallback("  Apple  ")).toEqual({
      query: "Apple",
      servings: 1,
      mealType: "",
    })
  })

  it("is null with no name left to look up", () => {
    expect(parseQuickAddFallback("x2")).toBeNull()
    expect(parseQuickAddFallback("   ")).toBeNull()
    expect(parseQuickAddFallback("lunch")).toBeNull()
  })
})

describe("rankLibraryFoods", () => {
  const lib = [
    { id: "a", name: "Banana bread" },
    { id: "b", name: "Bananas, raw" },
    { id: "c", name: "Dried banana" },
    { id: "d", name: "Banana" },
    { id: "e", name: "Oats" },
  ]

  it("puts an exact name first, then prefixes, then anything containing the query", () => {
    expect(rankLibraryFoods(lib, [], "banana").map((f) => f.id)).toEqual([
      "d",
      "a",
      "b",
      "c",
    ])
  })

  it("lifts what you log most within a tier, in the quick-pick order", () => {
    expect(
      rankLibraryFoods(lib, ["b", null, "a"], "banana").map((f) => f.id),
    ).toEqual(["d", "b", "a", "c"])
  })

  it("caps the list and answers nothing for nothing", () => {
    expect(rankLibraryFoods(lib, [], "banana", 2)).toHaveLength(2)
    expect(rankLibraryFoods(lib, [], "  ")).toEqual([])
  })
})

describe("weightTrend", () => {
  const END = "2026-07-26"
  const w = (date: string, weightLb: number) => ({ date, weightLb })

  it("is empty with nothing logged", () => {
    expect(weightTrend([], END)).toEqual({
      points: [],
      latest: null,
      ratePerWeekLb: null,
    })
  })

  it("starts the trend at the first reading, and orders oldest first", () => {
    const trend = weightTrend([w("2026-07-26", 181), w("2026-07-12", 185)], END)
    expect(trend.points.map((p) => p.date)).toEqual([
      "2026-07-12",
      "2026-07-26",
    ])
    expect(trend.points[0].trendLb).toBe(185)
    expect(trend.latest?.date).toBe("2026-07-26")
  })

  it("smooths a daily reading by about a tenth, like the classic trend", () => {
    // From 180 to a reading of 190 the next day: 1 - e^(-1/10) ≈ 0.095 of the gap.
    const trend = weightTrend([w("2026-07-25", 180), w("2026-07-26", 190)], END)
    expect(trend.latest?.trendLb).toBeCloseTo(180.95, 1)
  })

  it("takes a larger step across a longer gap, so a weekly habit is not left behind", () => {
    // A week later: 1 - e^(-7/10) ≈ 0.50 of the gap. Per-reading smoothing would have
    // moved the same 0.095 and called someone who lost ten pounds "down one".
    const trend = weightTrend([w("2026-07-19", 180), w("2026-07-26", 190)], END)
    expect(trend.latest?.trendLb).toBeCloseTo(185.03, 1)
  })

  // The T4 chart needed two separate WEEKS before it drew anything; three readings in
  // one week produced a point and a stub. Two readings on any two days is a trend now.
  it("gives two readings in one week a trend", () => {
    const trend = weightTrend(
      [w("2026-07-24", 182), w("2026-07-25", 181.5), w("2026-07-26", 181)],
      END,
    )
    expect(trend.points).toHaveLength(3)
    expect(trend.latest?.trendLb).toBeLessThan(182)
    expect(trend.latest?.trendLb).toBeGreaterThan(181)
  })

  it("withholds the rate until two weeks separate the readings", () => {
    const short = weightTrend([w("2026-07-20", 183), w("2026-07-26", 181)], END)
    expect(short.ratePerWeekLb).toBeNull()

    const enough = weightTrend(
      [w("2026-07-12", 183), w("2026-07-26", 181)],
      END,
    )
    expect(enough.ratePerWeekLb).not.toBeNull()
  })

  it("reads the rate off the trend line per week, sign and all", () => {
    // Two readings 14 days apart: the trend moves 1 - e^(-1.4) ≈ 0.753 of the 4 lb gap,
    // so about 3.01 lb over two weeks — roughly 1.5 lb a week, downward.
    const trend = weightTrend([w("2026-07-12", 185), w("2026-07-26", 181)], END)
    expect(trend.ratePerWeekLb).toBeCloseTo(-1.507, 2)

    const up = weightTrend([w("2026-07-12", 181), w("2026-07-26", 185)], END)
    expect(up.ratePerWeekLb).toBeCloseTo(1.507, 2)
  })

  it("judges the rate on the last four weeks, not the whole history", () => {
    // Twelve weeks of steady loss, then four flat weeks: the rate is the flat part.
    const rows = []
    for (let back = 84; back >= 28; back -= 7)
      rows.push(w(addDays(END, -back), 200 - (84 - back) / 7))
    for (let back = 21; back >= 0; back -= 7)
      rows.push(w(addDays(END, -back), 192))
    const trend = weightTrend(rows, END)
    // Not quite zero: the smoothed line is still closing the lag it built up during the
    // decline. Well under the pound a week the history would say, which is the point.
    expect(Math.abs(trend.ratePerWeekLb ?? 99)).toBeLessThan(0.3)
  })

  it("falls back to the whole span when the recent readings are too close together", () => {
    // Day 0, then two readings five days apart at the end: the recent pair cannot carry
    // a rate, so it is read from the first point instead of being withheld.
    const trend = weightTrend(
      [w("2026-06-11", 190), w("2026-07-21", 186), w("2026-07-26", 185)],
      END,
    )
    expect(trend.ratePerWeekLb).not.toBeNull()
    expect(trend.ratePerWeekLb ?? 0).toBeLessThan(0)
  })

  it("ignores readings outside the window and collapses a duplicate day", () => {
    const trend = weightTrend(
      [
        w("2020-01-01", 200),
        w("2026-07-26", 181),
        w("2026-07-26", 181.4),
        w("2026-12-25", 999),
      ],
      END,
    )
    expect(trend.points.map((p) => p.weightLb)).toEqual([181.4])
  })
})

describe("weightReadout", () => {
  const END = "2026-07-26"
  const w = (date: string, weightLb: number) => ({ date, weightLb })
  const losing = () =>
    weightTrend([w("2026-07-12", 185), w("2026-07-26", 181)], END)

  it("is null with nothing logged", () => {
    expect(weightReadout(weightTrend([], END), 170)).toBeNull()
  })

  it("quotes the latest reading and the trend, with no goal part unless a goal is set", () => {
    const readout = weightReadout(losing(), null)
    expect(readout?.latestLb).toBe(181)
    expect(readout?.latestDate).toBe("2026-07-26")
    expect(readout?.trendLb).toBeCloseTo(181.99, 1)
    expect(readout?.goal).toBeNull()
  })

  it("measures 'to go' from the trend, and estimates weeks at the current rate", () => {
    // Trend ≈ 181.99, goal 175 → about 7 lb to go at about 1.5 lb a week ≈ 4.6 weeks.
    const goal = weightReadout(losing(), 175)?.goal
    expect(goal?.direction).toBe("down")
    expect(goal?.toGoLb).toBeCloseTo(6.99, 1)
    expect(goal?.etaWeeks).toBeCloseTo(4.64, 1)
  })

  it("gives no estimate when the trend is moving AWAY from the goal", () => {
    const goal = weightReadout(losing(), 190)?.goal
    expect(goal?.direction).toBe("up")
    expect(goal?.etaWeeks).toBeNull()
  })

  it("gives no estimate without a rate, and none for a negligible one", () => {
    const noRate = weightTrend(
      [w("2026-07-20", 183), w("2026-07-26", 181)],
      END,
    )
    expect(weightReadout(noRate, 175)?.goal?.etaWeeks).toBeNull()

    // 0.03 lb a week toward the goal is noise; dividing by it would say 200 weeks.
    const crawl = weightTrend(
      [w("2026-07-12", 181.06), w("2026-07-26", 181)],
      END,
    )
    expect(Math.abs(crawl.ratePerWeekLb ?? 1)).toBeLessThan(0.1)
    expect(weightReadout(crawl, 175)?.goal?.etaWeeks).toBeNull()
  })

  it("calls half a pound from the goal being at it", () => {
    const goal = weightReadout(losing(), 182.2)?.goal
    expect(goal?.direction).toBe("at")
    expect(goal?.etaWeeks).toBeNull()
  })

  it("puts the goal into words, in the displayed unit, with or without the estimate", () => {
    const goal = weightReadout(losing(), 175)!.goal!
    expect(weightGoalPhrase(goal, "lb")).toBe(
      "7 lb to go, about 5 weeks at this rate",
    )
    expect(weightGoalPhrase(goal, "lb", { eta: false })).toBe("7 lb to go")
    expect(weightGoalPhrase(goal, "kg")).toBe(
      "3.2 kg to go, about 5 weeks at this rate",
    )
    expect(weightGoalPhrase(weightReadout(losing(), 190)!.goal!, "lb")).toBe(
      "8 lb to go",
    )
    expect(weightGoalPhrase(weightReadout(losing(), 182.2)!.goal!, "lb")).toBe(
      "at your goal",
    )
  })
})

describe("targetsForDate", () => {
  const older = { effectiveFrom: "2026-01-01", calories: 2000 }
  const newer = { effectiveFrom: "2026-07-20", calories: 2400 }
  const periods = [newer, older] // deliberately not in order

  it("picks the latest period that had already started", () => {
    expect(targetsForDate(periods, "2026-07-25")).toBe(newer)
    expect(targetsForDate(periods, "2026-03-01")).toBe(older)
  })

  it("counts the effective date itself as in force", () => {
    expect(targetsForDate(periods, "2026-07-20")).toBe(newer)
  })

  it("returns null before any period started", () => {
    expect(targetsForDate(periods, "2025-12-31")).toBeNull()
    expect(targetsForDate([], "2026-07-25")).toBeNull()
  })

  // The reason this function exists rather than one lookup for the whole week.
  it("resolves each day of a week that straddles a change", () => {
    const week = ["2026-07-18", "2026-07-19", "2026-07-20", "2026-07-21"]
    expect(week.map((d) => targetsForDate(periods, d)?.calories)).toEqual([
      2000, 2000, 2400, 2400,
    ])
  })
})

// --- Saved meals (T32) ---

const banana = {
  foodId: "f-banana",
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

const milk = {
  ...banana,
  foodId: "f-milk",
  name: "Milk",
  servingLabel: "1 cup",
  calories: 149,
  proteinG: 8,
  carbsG: 12,
  fatG: 8,
  fiberG: 0,
  sugarG: 12,
  satFatG: 4.6,
  sodiumMg: 105,
}

describe("resolveSavedMealItems", () => {
  it("takes the library food's current figures while the food exists", () => {
    const library = new Map([
      [
        "f-banana",
        { ...banana, name: "Banana, raw", servingLabel: "100 g", calories: 89 },
      ],
    ])
    const rows = [{ ...banana, id: "i-1", position: 0 }]
    const [item] = resolveSavedMealItems(rows, library)
    expect(item.name).toBe("Banana, raw")
    expect(item.servingLabel).toBe("100 g")
    expect(item.calories).toBe(89)
    // The row's own columns ride along, and the servings are the item's, not the food's.
    expect(item.id).toBe("i-1")
    expect(item.position).toBe(0)
    expect(item.servings).toBe(1)
  })

  it("stands the snapshot in once the food is gone", () => {
    // The FK has set the link to null…
    const [orphan] = resolveSavedMealItems(
      [{ ...banana, foodId: null }],
      new Map(),
    )
    expect(orphan.name).toBe("Banana")
    expect(orphan.calories).toBe(105)
    // …or the id simply no longer resolves, which is the same case from the other side.
    const [stale] = resolveSavedMealItems([banana], new Map())
    expect(stale.calories).toBe(105)
  })

  it("resolves each item on its own", () => {
    const library = new Map([["f-milk", { ...milk, calories: 120 }]])
    const items = resolveSavedMealItems([banana, milk], library)
    expect(items.map((item) => item.calories)).toEqual([105, 120])
  })
})

describe("itemsFromEntries", () => {
  it("keeps the order logged and only the item fields", () => {
    const entries = [
      { ...banana, id: "e-1", date: "2026-09-10", mealType: "breakfast" },
      { ...milk, id: "e-2", date: "2026-09-10", mealType: "breakfast" },
    ]
    const items = itemsFromEntries(entries)
    expect(items.map((item) => item.name)).toEqual(["Banana", "Milk"])
    expect(items[0]).not.toHaveProperty("id")
    expect(items[0]).not.toHaveProperty("date")
    expect(items[0]).toEqual(banana)
  })

  it("merges the same food logged twice into one item, servings added up", () => {
    const items = itemsFromEntries([banana, milk, { ...banana, servings: 2 }])
    expect(items).toHaveLength(2)
    expect(items[0].servings).toBe(3)
    expect(items[1].name).toBe("Milk")
  })

  it("merges by name, case-insensitively, when there is no library food", () => {
    const typed = { ...banana, foodId: null, name: "Quick entry" }
    const items = itemsFromEntries([
      typed,
      { ...typed, name: "quick entry", servings: 0.5 },
    ])
    expect(items).toHaveLength(1)
    expect(items[0].servings).toBe(1.5)
  })

  it("keeps two library foods apart even when they share a name", () => {
    const items = itemsFromEntries([banana, { ...banana, foodId: "f-other" }])
    expect(items).toHaveLength(2)
  })
})

describe("itemFromFood", () => {
  it("is one serving of the food, linked to it", () => {
    const food = { id: "f-milk", ...milk, barcode: null }
    expect(itemFromFood(food)).toEqual({
      ...milk,
      foodId: "f-milk",
      servings: 1,
    })
  })
})
