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

// --- Natural-language quick-add (meal entries) ---
// Pure: turn a typed line into a logMeal-ready payload (minus the caller-supplied date).
// Two modes — explicit macros ("lunch 600cal 40p 30c 10f") or a library-food match
// ("banana ×2"). Macros are always PER-SERVING (never pre-multiplied); `servings` does the
// scaling at read time via `entryTotals`. Sibling of the date parser in `src/lib/nl-date.ts`.

export type FoodOption = {
  id: string
  name: string
  servingLabel: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

export type ParsedMeal = {
  name: string
  servingLabel: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  servings: number
  mealType: "" | MealType
  foodId: string
  saveToLibrary: boolean
}

// Quantity: "x2" / "×2" / "*2" (operator-first) or "2x" / "2×" (number-first).
const QTY_OP_FIRST = /(?:^|\s)[x×*]\s?(\d+(?:\.\d+)?)(?=\s|$)/i
const QTY_NUM_FIRST = /(?:^|\s)(\d+(?:\.\d+)?)\s?[x×](?=\s|$)/i
// Macro tokens. Calories REQUIRE "cal"/"kcal" so a bare "c" is unambiguously carbs.
const MACRO_CALORIES = /(\d+(?:\.\d+)?)\s?k?cals?\b/i
const MACRO_PROTEIN = /(\d+(?:\.\d+)?)\s?p(?:rotein)?\b/i
const MACRO_CARBS = /(\d+(?:\.\d+)?)\s?c(?:arbs?)?\b/i
const MACRO_FAT = /(\d+(?:\.\d+)?)\s?f(?:at)?\b/i
const LEADING_MEAL_TYPE = /^(breakfast|lunch|dinner|snack)\b/i

// Blank a span with spaces so indices are preserved and later regexes can't re-see it.
function blankSpan(text: string, start: number, length: number): string {
  return text.slice(0, start) + " ".repeat(length) + text.slice(start + length)
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function capitalizeWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

// Exact (normalized) name, else a UNIQUE prefix match, else none.
function matchFood(query: string, foods: FoodOption[]): FoodOption | null {
  const q = collapse(query).toLowerCase()
  if (!q) return null
  const exact = foods.find((food) => collapse(food.name).toLowerCase() === q)
  if (exact) return exact
  const prefixed = foods.filter((food) =>
    collapse(food.name).toLowerCase().startsWith(q),
  )
  return prefixed.length === 1 ? prefixed[0] : null
}

/**
 * Parse a quick-add line into a meal-entry payload, or null when it's neither explicit
 * macros nor a matchable library food. The caller supplies the date.
 */
export function parseMealQuickAdd(
  text: string,
  foods: FoodOption[],
): ParsedMeal | null {
  if (!text.trim()) return null

  let work = text
  let servings = 1

  const qty = QTY_OP_FIRST.exec(work) ?? QTY_NUM_FIRST.exec(work)
  if (qty) {
    const q = parseFloat(qty[1])
    if (q > 0) servings = q
    work = blankSpan(work, qty.index, qty[0].length)
  }

  const macros = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  let hasMacro = false
  const extract = (re: RegExp, key: keyof typeof macros) => {
    const m = re.exec(work)
    if (!m) return
    macros[key] = parseFloat(m[1])
    hasMacro = true
    work = blankSpan(work, m.index, m[0].length)
  }
  extract(MACRO_CALORIES, "calories")
  extract(MACRO_PROTEIN, "proteinG")
  extract(MACRO_CARBS, "carbsG")
  extract(MACRO_FAT, "fatG")

  if (hasMacro) {
    let leftover = collapse(work)
    let mealType: "" | MealType = ""
    const lead = LEADING_MEAL_TYPE.exec(leftover)
    if (lead) {
      mealType = lead[1].toLowerCase() as MealType
      leftover = leftover.slice(lead[0].length).trim()
    }
    const name = leftover || (mealType ? capitalizeWord(mealType) : "Quick entry")
    return {
      name: name.slice(0, 200),
      servingLabel: "1 serving",
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
      servings,
      mealType,
      foodId: "",
      saveToLibrary: false,
    }
  }

  // Food-match: try the whole query first, then retry after stripping a leading meal-type
  // word ("dinner roll" stays a food; "lunch banana" → mealType lunch + "banana").
  let query = collapse(work)
  let mealType: "" | MealType = ""
  let food = matchFood(query, foods)
  if (!food) {
    const lead = LEADING_MEAL_TYPE.exec(query)
    if (lead) {
      mealType = lead[1].toLowerCase() as MealType
      query = query.slice(lead[0].length).trim()
      food = matchFood(query, foods)
    }
  }
  if (!food) return null

  return {
    name: food.name,
    servingLabel: food.servingLabel,
    calories: food.calories,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
    servings,
    mealType,
    foodId: food.id,
    saveToLibrary: false,
  }
}

// --- Recent / frequent quick-picks ---
// Pure ranking of a user's logged history into a short quick-pick list for one-tap logging.
// No DB — unit-testable. Fed by `getRecentEntries` (newest-first).

// The per-serving snapshot the ranker needs (a MealEntry[] is structurally assignable).
export type RecentEntry = {
  foodId: string | null
  name: string
  servingLabel: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

// A pickable food carrying its latest per-serving snapshot + a stable list key.
export type QuickPickFood = {
  key: string
  foodId: string | null
  name: string
  servingLabel: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

function pickKey(entry: RecentEntry): string {
  return entry.foodId ?? entry.name.trim().toLowerCase()
}

/**
 * Rank recent entries into a capped quick-pick list. `entries` MUST be newest-first (the
 * `getRecentEntries` contract). Each occurrence contributes weight `(n - index)`, so newer
 * logs weigh more and repeats accumulate — folding frequency + recency into one score.
 * Entries dedupe by `foodId ?? name.toLowerCase()`, carrying the most-recent snapshot.
 */
export function recentFrequentFoods(
  entries: RecentEntry[],
  limit = 8,
): QuickPickFood[] {
  const n = entries.length
  const ranked = new Map<
    string,
    { score: number; firstIndex: number; snap: RecentEntry }
  >()
  entries.forEach((entry, index) => {
    const key = pickKey(entry)
    if (!key) return
    const weight = n - index
    const seen = ranked.get(key)
    if (seen) {
      seen.score += weight
    } else {
      // First-seen is the newest (smallest index) — the snapshot to carry.
      ranked.set(key, { score: weight, firstIndex: index, snap: entry })
    }
  })
  return [...ranked.values()]
    .sort((a, b) => b.score - a.score || a.firstIndex - b.firstIndex)
    .slice(0, limit)
    .map(({ snap }) => ({
      key: pickKey(snap),
      foodId: snap.foodId,
      name: snap.name,
      servingLabel: snap.servingLabel,
      calories: snap.calories,
      proteinG: snap.proteinG,
      carbsG: snap.carbsG,
      fatG: snap.fatG,
    }))
}
