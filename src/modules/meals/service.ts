// Pure meal-macros logic. No DB — unit-testable directly.

export type Macros = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export const ZERO_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 }

// The minimal shape aggregation needs from a logged entry (per-serving snapshot).
export type MacroEntry = {
  servings: number
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

/** Macros contributed by one entry (per-serving snapshot × servings). */
export function entryTotals(entry: MacroEntry): Macros {
  return {
    calories: entry.calories * entry.servings,
    protein: entry.proteinG * entry.servings,
    carbs: entry.carbsG * entry.servings,
    fat: entry.fatG * entry.servings,
  }
}

/** Sum macros across many entries. */
export function sumMacros(entries: MacroEntry[]): Macros {
  return entries.reduce<Macros>(
    (acc, entry) => {
      const totals = entryTotals(entry)
      return {
        calories: acc.calories + totals.calories,
        protein: acc.protein + totals.protein,
        carbs: acc.carbs + totals.carbs,
        fat: acc.fat + totals.fat,
      }
    },
    { ...ZERO_MACROS },
  )
}

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const
export type MealType = (typeof MEAL_TYPES)[number]

export type MealGroup<T> = {
  mealType: MealType | "other"
  label: string
  entries: T[]
  totals: Macros
}

const MEAL_LABELS: Record<MealType | "other", string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  other: "Other",
}

/** Group entries into ordered meal sections (empty sections omitted), each with
 * its subtotal. Entries with no meal type fall into "other". */
export function groupByMealType<
  T extends MacroEntry & { mealType: MealType | null },
>(entries: T[]): MealGroup<T>[] {
  const order: (MealType | "other")[] = [...MEAL_TYPES, "other"]
  const groups: MealGroup<T>[] = []
  for (const mealType of order) {
    const key = mealType === "other" ? null : mealType
    const groupEntries = entries.filter((entry) => (entry.mealType ?? null) === key)
    if (groupEntries.length === 0) continue
    groups.push({
      mealType,
      label: MEAL_LABELS[mealType],
      entries: groupEntries,
      totals: sumMacros(groupEntries),
    })
  }
  return groups
}

export type MacroProgress = {
  consumed: number
  target: number | null
  remaining: number | null
  percent: number | null
}

export type MacroProgressSet = {
  calories: MacroProgress
  protein: MacroProgress
  carbs: MacroProgress
  fat: MacroProgress
}

// Targets come straight from the macro_targets row (DB column names).
export type MacroTargetValues = {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

function progress(consumed: number, target: number | null | undefined): MacroProgress {
  if (target == null || target <= 0) {
    return { consumed, target: null, remaining: null, percent: null }
  }
  return {
    consumed,
    target,
    remaining: target - consumed,
    percent: Math.round((consumed / target) * 100),
  }
}

/** Consumed vs. target per macro. Missing/zero targets yield null comparisons. */
export function macroProgress(
  totals: Macros,
  targets: MacroTargetValues | null,
): MacroProgressSet {
  return {
    calories: progress(totals.calories, targets?.calories),
    protein: progress(totals.protein, targets?.proteinG),
    carbs: progress(totals.carbs, targets?.carbsG),
    fat: progress(totals.fat, targets?.fatG),
  }
}
