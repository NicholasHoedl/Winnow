// Pure meal-macros logic. No DB — unit-testable directly.

import { addDays, dayDiff } from "@/lib/date"
import { formatWeight } from "@/lib/format"

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

export const MEAL_LABELS: Record<MealType | "other", string> = {
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
    const groupEntries = entries.filter(
      (entry) => (entry.mealType ?? null) === key,
    )
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

/**
 * Atwater factors: the kcal each gram of a macronutrient is counted as.
 *
 * The first calorie/gram conversion in the app — every other figure here is either already
 * kcal or already grams. Module-local rather than in `src/lib/`, following `KJ_PER_KCAL` in
 * `off-mapping.ts`: these are facts about nutrition, and nutrition lives in this module.
 *
 * They are the rounded conventional values, not the precise ones (protein is nearer 4.1).
 * Every food label in the world is computed with these, so matching labels matters more
 * than matching a bomb calorimeter.
 */
export const KCAL_PER_PROTEIN_G = 4
export const KCAL_PER_CARB_G = 4
export const KCAL_PER_FAT_G = 9

/**
 * What carbs would have to be for a target's macros to account for its calories.
 *
 * A union rather than `number | null`, because "there is no answer" has two very different
 * causes and the caller has to tell them apart: one is a target that opted out of the whole
 * question, the other is a target that cannot be satisfied. A nullable number would let a
 * caller treat the second as the first and silently write something wrong.
 */
export type CarbFit =
  /**
   * At least one of calories, protein or fat is 0, which this app reads as "not tracked" —
   * see `progress()` below and the targets dialog's own copy. Deriving carbs from a target
   * that is deliberately partial would make "I only track protein" impossible to express,
   * so the arithmetic declines to run at all.
   */
  | { kind: "skipped" }
  /** The remainder, in grams, never negative. */
  | { kind: "fits"; carbsG: number }
  /**
   * Protein and fat alone already exceed the calorie target, so there is no non-negative
   * carb figure that balances. `byKcal` is the overshoot, for a message that says how far
   * out it is rather than just refusing.
   */
  | { kind: "overshoot"; byKcal: number }

/** What a macro split accounts for, in kcal, by the factors above. */
export function macroCalories(
  macros: Pick<MacroTargetValues, "proteinG" | "carbsG" | "fatG">,
): number {
  return (
    macros.proteinG * KCAL_PER_PROTEIN_G +
    macros.carbsG * KCAL_PER_CARB_G +
    macros.fatG * KCAL_PER_FAT_G
  )
}

/**
 * Carbs as the balancing term: `calories = 4·protein + 4·carbs + 9·fat`, solved for carbs.
 *
 * Carbs absorb the remainder rather than any other macro because protein and fat are the
 * numbers people set deliberately — protein from bodyweight, fat from a floor — and carbs
 * are what is left of the energy budget afterwards.
 *
 * Rounded to one decimal. The column is `real`, and rounding to whole grams would reintroduce
 * up to 4 kcal of the drift this exists to remove.
 */
export function carbsForCalories(target: {
  calories: number
  proteinG: number
  fatG: number
}): CarbFit {
  const { calories, proteinG, fatG } = target
  if (calories <= 0 || proteinG <= 0 || fatG <= 0) return { kind: "skipped" }

  const fromProteinAndFat =
    proteinG * KCAL_PER_PROTEIN_G + fatG * KCAL_PER_FAT_G
  const remaining = calories - fromProteinAndFat
  if (remaining < 0) return { kind: "overshoot", byKcal: -remaining }

  return {
    kind: "fits",
    carbsG: Math.round((remaining / KCAL_PER_CARB_G) * 10) / 10,
  }
}

function progress(
  consumed: number,
  target: number | null | undefined,
): MacroProgress {
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
//
// **The leading word boundary is a bug fix, not tidying.** These ended at a boundary but did
// not start at one, so digits-then-letter could be matched from INSIDE a word: a food named
// `abc278c` parsed as 278 carbs and lost that part of its own name. Above 100000 the action
// then rejected the whole entry with "Please fix the errors below.", which reads exactly like
// a dropped entry and cost real time to tell apart from a capture bug.
//
// It works because `c` and `2` are both word characters, so there is no boundary between
// them — while a genuine `600cal` after a space still matches.
const MACRO_CALORIES = /\b(\d+(?:\.\d+)?)\s?k?cals?\b/i
const MACRO_PROTEIN = /\b(\d+(?:\.\d+)?)\s?p(?:rotein)?\b/i
const MACRO_CARBS = /\b(\d+(?:\.\d+)?)\s?c(?:arbs?)?\b/i
const MACRO_FAT = /\b(\d+(?:\.\d+)?)\s?f(?:at)?\b/i
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
    const name =
      leftover || (mealType ? capitalizeWord(mealType) : "Quick entry")
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

/**
 * What the quick-add bar hands to the reference foods when nothing in the library
 * matched: the name with the quantity and a leading meal-type word stripped, or null when
 * no name is left to look up. The explicit-macro case never reaches here —
 * `parseMealQuickAdd` answers it first — so this only has to read a food's name the way
 * that parser does (T31, ADR-0025).
 */
export function parseQuickAddFallback(text: string): {
  query: string
  servings: number
  mealType: "" | MealType
} | null {
  let work = text
  let servings = 1
  const qty = QTY_OP_FIRST.exec(work) ?? QTY_NUM_FIRST.exec(work)
  if (qty) {
    const q = parseFloat(qty[1])
    if (q > 0) servings = q
    work = blankSpan(work, qty.index, qty[0].length)
  }
  let query = collapse(work)
  let mealType: "" | MealType = ""
  const lead = LEADING_MEAL_TYPE.exec(query)
  if (lead) {
    mealType = lead[1].toLowerCase() as MealType
    query = query.slice(lead[0].length).trim()
  }
  return query ? { query: query.slice(0, 100), servings, mealType } : null
}

/**
 * Library foods matching a query, the way the search bar lists them: an exact name first,
 * then names the query begins, then names containing it — and within a tier the foods
 * logged most recently and often first, in `recentIds`' order (the quick-pick ranking).
 */
export function rankLibraryFoods<T extends { id: string; name: string }>(
  foods: T[],
  recentIds: readonly (string | null)[],
  query: string,
  limit = 5,
): T[] {
  const q = collapse(query).toLowerCase()
  if (!q) return []
  const recent = new Map<string, number>()
  recentIds.forEach((id, index) => {
    if (id && !recent.has(id)) recent.set(id, index)
  })
  return foods
    .flatMap((food) => {
      const name = collapse(food.name).toLowerCase()
      const tier =
        name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : -1
      if (tier < 0) return []
      return [{ food, tier, recent: recent.get(food.id) ?? Infinity }]
    })
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.recent - b.recent ||
        a.food.name.localeCompare(b.food.name),
    )
    .slice(0, limit)
    .map((entry) => entry.food)
}

// --- Recent / frequent quick-picks ---
// Pure ranking of a user's logged history into a short quick-pick list for one-tap logging.
// No DB — unit-testable. Fed by `getRecentEntries` (newest-first).

// The per-serving snapshot the ranker needs (a MealEntry[] is structurally assignable).
// Micros are carried so a one-tap re-log reproduces the entry rather than quietly
// logging a version of it with its fiber and sodium stripped out.
export type RecentEntry = {
  foodId: string | null
  name: string
  servingLabel: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number | null
  sugarG: number | null
  satFatG: number | null
  sodiumMg: number | null
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
  fiberG: number | null
  sugarG: number | null
  satFatG: number | null
  sodiumMg: number | null
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
      fiberG: snap.fiberG,
      sugarG: snap.sugarG,
      satFatG: snap.satFatG,
      sodiumMg: snap.sodiumMg,
    }))
}

// --- Saved meals (T32, ADR-0026) ---

/**
 * One food in a saved meal, as the editor holds it and the save action receives it: the
 * library food it came from (or none), its figures for one serving, and how many.
 */
export type SavedMealItemInput = {
  foodId: string | null
  name: string
  servingLabel: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number | null
  sugarG: number | null
  satFatG: number | null
  sodiumMg: number | null
  servings: number
}

/** The figures an item takes from its library food while the food exists. */
export type FoodFigures = Omit<SavedMealItemInput, "foodId" | "servings">

/** Exactly the item fields, off an entry row, a food row or anything else that has them. */
function toSavedMealItem(source: SavedMealItemInput): SavedMealItemInput {
  return {
    foodId: source.foodId,
    name: source.name,
    servingLabel: source.servingLabel,
    calories: source.calories,
    proteinG: source.proteinG,
    carbsG: source.carbsG,
    fatG: source.fatG,
    fiberG: source.fiberG,
    sugarG: source.sugarG,
    satFatG: source.satFatG,
    sodiumMg: source.sodiumMg,
    servings: source.servings,
  }
}

/** A library food as a new item: one serving of it. */
export function itemFromFood(
  food: { id: string } & FoodFigures,
): SavedMealItemInput {
  return toSavedMealItem({ ...food, foodId: food.id, servings: 1 })
}

/**
 * Items as they stand today. An item FOLLOWS its library food: while the food exists its
 * current name, serving and figures are used, so a correction to the milk in the library
 * reaches every saved meal that has it. Once the food is gone — the FK sets `foodId` to
 * null — the item's own snapshot stands in, so a deleted food never silently shrinks a
 * meal. Generic so a row's other columns (id, position) ride along for the editor.
 */
export function resolveSavedMealItems<
  T extends { foodId: string | null } & FoodFigures,
>(items: T[], foodsById: ReadonlyMap<string, FoodFigures>): T[] {
  return items.map((item) => {
    const food = item.foodId ? foodsById.get(item.foodId) : undefined
    if (!food) return item
    return {
      ...item,
      name: food.name,
      servingLabel: food.servingLabel,
      calories: food.calories,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
      fiberG: food.fiberG,
      sugarG: food.sugarG,
      satFatG: food.satFatG,
      sodiumMg: food.sodiumMg,
    }
  })
}

/**
 * A section of the day's log as saved-meal items — "Save as meal" on a Breakfast heading.
 *
 * The same food logged twice in the section becomes one item with the servings added
 * up, keyed the way the quick picks are: by the library food, else by the name. Two
 * bananas at breakfast are one item of two servings, not two rows the editor then has to
 * tidy. Order is the order logged, and the first occurrence's figures are kept — the item
 * follows the library from then on anyway.
 */
export function itemsFromEntries(
  entries: SavedMealItemInput[],
): SavedMealItemInput[] {
  const merged = new Map<string, SavedMealItemInput>()
  for (const entry of entries) {
    const key = entry.foodId ?? `name:${entry.name.trim().toLowerCase()}`
    const seen = merged.get(key)
    if (seen) {
      merged.set(key, { ...seen, servings: seen.servings + entry.servings })
    } else {
      merged.set(key, toSavedMealItem(entry))
    }
  }
  return [...merged.values()]
}

// --- Micronutrients ---

export type Micros = {
  fiber: number | null
  sugar: number | null
  sodium: number | null
  satFat: number | null
}

/** The micro half of a logged entry. Per-serving, like the macros. */
export type MicroEntry = {
  servings: number
  fiberG: number | null
  sugarG: number | null
  satFatG: number | null
  sodiumMg: number | null
}

export type MicroTotals = {
  /** null for a micro no entry carried — NOT 0, which would claim a measurement. */
  totals: Micros
  /** How many entries carried each micro, so the UI can qualify the number. */
  known: Record<keyof Micros, number>
  /** Entries considered, so "5 of 8 items" can be said honestly. */
  total: number
}

const MICRO_FIELDS = [
  ["fiber", "fiberG"],
  ["sugar", "sugarG"],
  ["sodium", "sodiumMg"],
  ["satFat", "satFatG"],
] as const

/**
 * Sum micronutrients across a day. Deliberately NOT folded into {@link sumMacros}:
 * macros are always present so their total is always a number, whereas a micro total
 * is meaningless unless you also know how many entries contributed to it. Summing
 * three of eight entries' sodium and printing it as "the day's sodium" is a lie.
 */
export function sumMicros(entries: MicroEntry[]): MicroTotals {
  const totals: Micros = {
    fiber: null,
    sugar: null,
    sodium: null,
    satFat: null,
  }
  const known: Record<keyof Micros, number> = {
    fiber: 0,
    sugar: 0,
    sodium: 0,
    satFat: 0,
  }

  for (const entry of entries) {
    for (const [key, column] of MICRO_FIELDS) {
      const perServing = entry[column]
      if (perServing == null) continue
      known[key] += 1
      totals[key] = (totals[key] ?? 0) + perServing * entry.servings
    }
  }

  for (const [key] of MICRO_FIELDS) {
    const value = totals[key]
    // Float noise: 0.7 * 3 is 2.0999999999999996 before this.
    if (value !== null) totals[key] = Math.round(value * 10) / 10
  }

  return { totals, known, total: entries.length }
}

// --- Body weight trend ---

export type WeightPoint = { date: string; weightLb: number }

/** A weigh-in with the smoothed trend as it stood on that day. */
export type TrendPoint = WeightPoint & { trendLb: number }

export type WeightTrend = {
  /** Every weigh-in in the window, oldest first, each carrying the trend on its day. */
  points: TrendPoint[]
  /** The newest weigh-in, or null with nothing logged. */
  latest: TrendPoint | null
  /**
   * How fast the TREND is moving, in pounds per week; negative is down. Null until there
   * are two weeks of data to judge it by.
   */
  ratePerWeekLb: number | null
}

/**
 * The smoothing's time constant, in days.
 *
 * Time-aware rather than the classic fixed ten percent per reading: `1 - e^(-gap/τ)` with
 * τ = 10 gives a daily habit almost exactly the Hacker's Diet step (about 0.095), and a
 * weekly weigh-in about half — so a weekly habit is not left lagging for months behind
 * the number on the scale, which is what a per-reading constant would do to it.
 */
const TREND_TAU_DAYS = 10
/** The rate is read off the last four weeks of the trend line… */
const RATE_WINDOW_DAYS = 28
/** …and only once the points it is read between are at least this far apart. */
const RATE_MIN_SPAN_DAYS = 14

/**
 * The trend through a run of weigh-ins: an exponentially smoothed line, one value per
 * weigh-in, plus how fast it is moving.
 *
 * Replaces the T4 weekly buckets. Those kept one reading per seven-day window and drew
 * nothing until two windows held a reading, so three weigh-ins inside a week produced a
 * single point and a stub — which is the "nothing is done with them" the user reported.
 * Two weigh-ins on any two days produce a trend here.
 *
 * Day-to-day weight swings a pound or two on water and food; the trend is the part worth
 * watching, and it is the number every readout in the app quotes. The raw readings are
 * kept beside it so the chart can show both.
 *
 * `days` bounds the window back from `endDate`, inclusive. The rate compares the newest
 * point with the oldest one inside {@link RATE_WINDOW_DAYS} of it, or with the first point
 * of all when that pair is too close together to mean anything.
 */
export function weightTrend(
  rows: WeightPoint[],
  endDate: string,
  days = 91,
): WeightTrend {
  const span = Math.max(1, Math.floor(days))
  const earliest = addDays(endDate, -(span - 1))

  // One reading per day is the table's rule; kept defensively here so a duplicate in a
  // test fixture or an imported file cannot double-step the smoothing.
  const byDate = new Map<string, WeightPoint>()
  for (const row of rows) {
    if (row.date < earliest || row.date > endDate) continue
    byDate.set(row.date, row)
  }
  const sorted = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  )

  const points: TrendPoint[] = []
  let trend: number | null = null
  let previous: string | null = null
  for (const row of sorted) {
    if (trend === null || previous === null) trend = row.weightLb
    else {
      const gap = dayDiff(previous, row.date)
      const alpha = 1 - Math.exp(-gap / TREND_TAU_DAYS)
      trend += alpha * (row.weightLb - trend)
    }
    previous = row.date
    points.push({ ...row, trendLb: trend })
  }

  const latest = points[points.length - 1] ?? null
  let ratePerWeekLb: number | null = null
  if (latest && points.length > 1) {
    const windowStart = addDays(latest.date, -RATE_WINDOW_DAYS)
    let reference =
      points.find((point) => point.date >= windowStart) ?? points[0]
    if (dayDiff(reference.date, latest.date) < RATE_MIN_SPAN_DAYS)
      reference = points[0]
    const spanDays = dayDiff(reference.date, latest.date)
    if (spanDays >= RATE_MIN_SPAN_DAYS)
      ratePerWeekLb = ((latest.trendLb - reference.trendLb) / spanDays) * 7
  }

  return { points, latest, ratePerWeekLb }
}

export type WeightReadout = {
  latestLb: number
  latestDate: string
  trendLb: number
  ratePerWeekLb: number | null
  /** Present when a goal weight is set. */
  goal: {
    goalLb: number
    /** Distance from the TREND to the goal, always positive. */
    toGoLb: number
    /** Which way the trend has to move — or "at", within half a pound of it. */
    direction: "down" | "up" | "at"
    /**
     * Weeks to reach it at the current rate. Null unless the rate points TOWARD the goal
     * and is worth extrapolating — omitted rather than invented, see the constants.
     */
    etaWeeks: number | null
  } | null
}

/** Closer than this to the goal reads as being at it. */
const AT_GOAL_LB = 0.5
/** A rate under this is noise, and dividing by it would promise the goal by Tuesday. */
const ETA_MIN_RATE_LB_PER_WEEK = 0.1
/** Past this the estimate is a number with no information in it. */
const ETA_MAX_WEEKS = 104

/**
 * What the app says about your weight, everywhere it says anything: on the weigh-in
 * card, over the chart, and in the dashboard's Macros tile. One function so the three
 * cannot disagree. Null with nothing logged; the goal part null with no goal set.
 */
export function weightReadout(
  trend: WeightTrend,
  goalWeightLb: number | null,
): WeightReadout | null {
  const latest = trend.latest
  if (!latest) return null

  let goal: WeightReadout["goal"] = null
  if (goalWeightLb !== null) {
    const gap = latest.trendLb - goalWeightLb
    const toGoLb = Math.abs(gap)
    const direction = toGoLb < AT_GOAL_LB ? "at" : gap > 0 ? "down" : "up"
    const rate = trend.ratePerWeekLb
    const toward =
      rate !== null &&
      Math.abs(rate) >= ETA_MIN_RATE_LB_PER_WEEK &&
      ((direction === "down" && rate < 0) || (direction === "up" && rate > 0))
    const eta = toward ? toGoLb / Math.abs(rate) : null
    goal = {
      goalLb: goalWeightLb,
      toGoLb,
      direction,
      etaWeeks: eta !== null && eta <= ETA_MAX_WEEKS ? eta : null,
    }
  }

  return {
    latestLb: latest.weightLb,
    latestDate: latest.date,
    trendLb: latest.trendLb,
    ratePerWeekLb: trend.ratePerWeekLb,
    goal,
  }
}

/**
 * The goal part of a readout, in words: "4.6 lb to go, about 12 weeks at this rate",
 * "4.6 lb to go", or "at your goal". `eta: false` drops the estimate — the dashboard tile
 * has one line for the whole readout, and the meals page carries the long form.
 */
export function weightGoalPhrase(
  goal: NonNullable<WeightReadout["goal"]>,
  unit: "lb" | "kg",
  { eta = true }: { eta?: boolean } = {},
): string {
  if (goal.direction === "at") return "at your goal"
  const toGo = `${formatWeight(goal.toGoLb, unit)} to go`
  if (!eta || goal.etaWeeks === null) return toGo
  const weeks = Math.max(1, Math.round(goal.etaWeeks))
  return `${toGo}, about ${weeks} ${weeks === 1 ? "week" : "weeks"} at this rate`
}

// --- Barcodes ---

/**
 * Whether a string is plausibly a retail barcode: 8–14 digits, nothing else.
 * Covers EAN-8, UPC-A (12), EAN-13, and ITF-14.
 *
 * This is a **security gate, not a nicety** — the value is interpolated into a URL
 * path segment when looking a product up, so it has to be digits before it goes
 * anywhere near a URL. Shared with the scanner's manual-entry field.
 *
 * Deliberately no check-digit validation: a well-formed but wrong barcode already
 * degrades to "no product found", which is a fine answer, whereas a checksum bug
 * would reject real products for no benefit.
 */
export function isLikelyBarcode(value: string): boolean {
  return /^\d{8,14}$/.test(value.trim())
}

/**
 * The target period in force on `date` — the latest one that had started by then.
 *
 * `getMacroTargets(date)` already answers this, but in SQL and one date at a time. A
 * week-long report needs it seven times, and resolving it once for the whole week is the
 * bug this exists to prevent: targets are effective-dated, so a week that straddles a
 * change would be scored entirely against whichever end happened to be asked for.
 *
 * Generic in the row so callers can pass whole `macro_targets` rows and keep every column.
 */
export function targetsForDate<T extends { effectiveFrom: string }>(
  targets: readonly T[],
  date: string,
): T | null {
  let best: T | null = null
  for (const target of targets) {
    // Date strings compare lexicographically == chronologically.
    if (target.effectiveFrom > date) continue
    if (!best || target.effectiveFrom > best.effectiveFrom) best = target
  }
  return best
}
