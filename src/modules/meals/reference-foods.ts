// Generic foods, bundled: the shape of the reference dataset, its search, and the scaling
// of a per-100 g food to a household portion. Pure and dependency-free so it unit-tests
// without the dataset; `reference-data.ts` is the `server-only` module that loads the
// generated JSON and holds the index. ADR-0025.
//
// The dataset is USDA FoodData Central's SR Legacy release, trimmed by
// `scripts/build-food-reference.ts` to the ten figures the food model holds and each
// food's household measures. Public domain (CC0); USDA asks to be named as the source.

/** The nutrients a food carries, per 100 g. Micros are null where USDA has no figure. */
export type ReferenceNutrients = {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number | null
  sugarG: number | null
  satFatG: number | null
  sodiumMg: number | null
}

/** A household measure: "1 cup, sliced" and the grams it weighs. */
export type ReferencePortion = { label: string; grams: number }

export type ReferenceFood = {
  /** FoodData Central's `fdcId`, stable across releases. */
  id: number
  /** USDA's description, e.g. "Bananas, raw". */
  name: string
  category: string
  per100g: ReferenceNutrients
  /** In the dataset's own order; may be empty, in which case 100 g is the only portion. */
  portions: ReferencePortion[]
}

/**
 * The generated file's shape: one tuple per food, to keep two megabytes from being four.
 * `[id, name, category, [kcal, protein, carbs, fat, fiber, sugar, satFat, sodiumMg],
 * [[label, grams], …]]`, micros null where unknown.
 */
export type ReferenceRow = [
  number,
  string,
  string,
  [
    number,
    number,
    number,
    number,
    number | null,
    number | null,
    number | null,
    number | null,
  ],
  [string, number][],
]

export type ReferenceFile = { source: string; foods: ReferenceRow[] }

export function decodeReferenceFoods(file: ReferenceFile): ReferenceFood[] {
  return file.foods.map(([id, name, category, n, portions]) => ({
    id,
    name,
    category,
    per100g: {
      calories: n[0],
      proteinG: n[1],
      carbsG: n[2],
      fatG: n[3],
      fiberG: n[4],
      sugarG: n[5],
      satFatG: n[6],
      sodiumMg: n[7],
    },
    portions: portions.map(([label, grams]) => ({ label, grams })),
  }))
}

// --- Search ---

/**
 * A description split into search tokens, lower-cased, with a trailing "s" dropped from
 * a word of five letters or more so that "banana" meets "Bananas, raw" as an exact token
 * rather than a prefix. Crude stemming, and enough: USDA names are plural nouns followed
 * by qualifiers. Short words keep their s — "peas", "eggs" and "oats" are not stems of
 * anything, and a query typed without the s still lands on them as a prefix.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9%]+/)
    .filter((token) => token.length > 0)
    .map((token) =>
      token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token,
    )
}

export type IndexedFood = {
  food: ReferenceFood
  tokens: string[]
  /** A standing adjustment for how plain the food is — see `nameBias`. */
  bias: number
}

/**
 * Words that mark the plain form of a food. USDA lists "Apples, raw, with skin" beside
 * "Apples, dried, sulfured" and "Egg, whole, raw, fresh" beside "Egg substitute, powder";
 * a query of one word should land on the first of each pair.
 */
const PLAIN_WORDS = new Set([
  "raw",
  "cooked",
  "fresh",
  "plain",
  "whole",
  // "all commercial varieties": USDA's own marker for the generic entry.
  "commercial",
])
const PLAIN_BONUS = 1
/** One plain word is the signal; "raw, without skin, cooked, boiled" is not plainer. */
const PLAIN_BONUS_CAP = 1

/** Words that mark a preparation or a product rather than the food itself. */
const PROCESSED_WORDS = new Set([
  "babyfood",
  "bar",
  "bars",
  "battered",
  "bran",
  "breaded",
  "candies",
  "canned",
  "cereal",
  "cereals",
  "chips",
  "crackers",
  "dehydrated",
  "deli",
  "dessert",
  "desserts",
  "dried",
  "fast",
  "flour",
  // "fat-free", "gluten-free": a product claim, never a raw ingredient.
  "free",
  "frozen",
  "heated",
  "imitation",
  "jam",
  "jelly",
  "juice",
  "microwaved",
  "mix",
  "noodle",
  "noodles",
  "nugget",
  "nuggets",
  "powder",
  "prepackaged",
  "prepared",
  "restaurant",
  "roll",
  "rotisserie",
  "sauce",
  "seasoned",
  "smoked",
  "snack",
  "snacks",
  "soup",
  "spread",
  "substitute",
  "syrup",
  "tender",
  "tenders",
])
// A product word has to cost as much as the head-noun bonus is worth, or "Salmon
// nuggets" — head noun, one product word — outranks "Fish, salmon, …, cooked".
const PROCESSED_PENALTY = 2
const PROCESSED_PENALTY_CAP = 4
/** A brand in capitals — "Yogurt, Greek, Blueberry, CHOBANI" — belongs to the packaged list. */
const BRAND_PENALTY = 2
const BRAND_RE = /\b(?!USDA\b)[A-Z][A-Z'&-]{2,}\b/

/**
 * A standing adjustment to a name's score, independent of any query: up for the plain
 * form of a food, down for a preparation, a product, or a brand. Small next to a token
 * match — it decides between names that match a query equally well, which is exactly the
 * case the first version got wrong ("Chicken breast tenders, breaded" is shorter than
 * "Chicken, broilers or fryers, breast, meat only, cooked, roasted").
 */
export function nameBias(name: string, tokens: string[]): number {
  let plain = 0
  let penalty = 0
  for (const token of tokens) {
    if (PLAIN_WORDS.has(token)) plain += PLAIN_BONUS
    if (PROCESSED_WORDS.has(token)) penalty += PROCESSED_PENALTY
  }
  let bias =
    Math.min(plain, PLAIN_BONUS_CAP) - Math.min(penalty, PROCESSED_PENALTY_CAP)
  if (BRAND_RE.test(name)) bias -= BRAND_PENALTY
  return bias
}

export function buildReferenceIndex(foods: ReferenceFood[]): IndexedFood[] {
  return foods.map((food) => {
    const tokens = tokenize(food.name)
    return { food, tokens, bias: nameBias(food.name, tokens) }
  })
}

const EXACT_TOKEN = 3
const PREFIX_TOKEN = 2
/**
 * The first token of a USDA name is the food itself — "Bananas", "Chicken", "Soup". Paid
 * for an exact hit only: a prefix on the head ("salmon" in "Salmonberries") must not
 * outrank an exact word further in ("Fish, salmon").
 */
const HEAD_BONUS = 2
/** "olive oil" should find "Oil, olive, …" before "Oil, corn, peanut, and olive". */
const ADJACENT_BONUS = 1

/**
 * How well a name answers a query, or null when a query token matches nothing in it.
 *
 * Every query token has to land — "chicken breast" must not surface "Soup, chicken
 * noodle" — and each lands either exactly or as a prefix of a name token. A match on
 * the head noun is worth more than one deep in the qualifiers, and a shorter name wins a
 * tie: "Bananas, raw" over "Bananas, dehydrated, or banana powder". The tiebreak is what
 * puts the plain food first, which is the whole complaint about the packaged-goods
 * database this replaces for generic queries.
 */
export function scoreName(
  queryTokens: string[],
  nameTokens: string[],
): number | null {
  if (queryTokens.length === 0 || nameTokens.length === 0) return null
  let score = 0
  for (const q of queryTokens) {
    let best = 0
    nameTokens.forEach((token, index) => {
      let s = 0
      if (token === q) s = EXACT_TOKEN + (index === 0 ? HEAD_BONUS : 0)
      else if (token.startsWith(q)) s = PREFIX_TOKEN
      if (s > best) best = s
    })
    if (best === 0) return null
    score += best
  }
  if (queryTokens.length > 1 && appearsInOrder(queryTokens, nameTokens))
    score += ADJACENT_BONUS
  // Shorter names first among equals. Bounded so it never outweighs a real token.
  return score + 1 / (1 + nameTokens.length)
}

/**
 * Whether the query's tokens appear consecutively somewhere in the name — in the query's
 * order or its reverse, because USDA leads with the head noun: "olive oil" is written
 * "Oil, olive".
 */
function appearsInOrder(queryTokens: string[], nameTokens: string[]): boolean {
  const matches = (name: string, q: string) => name === q || name.startsWith(q)
  const runs = [queryTokens, [...queryTokens].reverse()]
  for (const run of runs) {
    for (let start = 0; start + run.length <= nameTokens.length; start++) {
      if (run.every((q, i) => matches(nameTokens[start + i], q))) return true
    }
  }
  return false
}

export function searchReferenceFoods(
  index: IndexedFood[],
  query: string,
  limit = 6,
): ReferenceFood[] {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []
  const scored: { food: ReferenceFood; score: number }[] = []
  for (const entry of index) {
    const score = scoreName(queryTokens, entry.tokens)
    if (score !== null)
      scored.push({ food: entry.food, score: score + entry.bias })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name))
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.food)
}

/**
 * Whether the best match is good enough to log without asking — the quick-add bar's
 * question. Every query token matched (the scorer's rule) AND one of them named the
 * food: the head noun, or the word after it when the head is a group ("Fish, salmon",
 * "Nuts, almonds"). A qualifier does not count, so "raw" alone — which lands in the
 * second slot of "Apples, raw" — logs nothing rather than a guess.
 */
export function bestReferenceFood(
  index: IndexedFood[],
  query: string,
): ReferenceFood | null {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return null
  const [top] = searchReferenceFoods(index, query, 1)
  if (!top) return null
  const nouns = tokenize(top.name)
    .slice(0, 2)
    .filter((token) => !PLAIN_WORDS.has(token) && !PROCESSED_WORDS.has(token))
  const named = queryTokens.some((q) =>
    nouns.some((noun) => noun === q || noun.startsWith(q)),
  )
  return named ? top : null
}

// --- Portions and scaling ---

/**
 * The portion to assume when nobody chose one: a "medium" if the food has one, else the
 * first measure USDA lists, else 100 g. The dialog offers the rest; quick add takes this
 * and says which in its toast.
 */
export function defaultPortion(food: ReferenceFood): ReferencePortion {
  const medium = food.portions.find((portion) =>
    /\bmedium\b/i.test(portion.label),
  )
  return medium ?? food.portions[0] ?? { label: "100 g", grams: 100 }
}

/** "1 medium (7\" to 7-7/8\" long) (118 g)", or "100 g" for the bare basis. */
export function portionLabel(portion: ReferencePortion): string {
  return portion.label === "100 g" && portion.grams === 100
    ? "100 g"
    : `${portion.label} (${round1(portion.grams)} g)`
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function scale(value: number | null, grams: number): number | null {
  return value === null ? null : round1((value * grams) / 100)
}

/** The figures for one portion of a reference food, in the shape a food row takes. */
export type ScaledReferenceFood = ReferenceNutrients & {
  name: string
  servingLabel: string
}

export function scaleReferenceFood(
  food: ReferenceFood,
  portion: ReferencePortion,
): ScaledReferenceFood {
  const { grams } = portion
  const n = food.per100g
  return {
    name: food.name,
    servingLabel: portionLabel(portion).slice(0, 100),
    calories: scale(n.calories, grams) ?? 0,
    proteinG: scale(n.proteinG, grams) ?? 0,
    carbsG: scale(n.carbsG, grams) ?? 0,
    fatG: scale(n.fatG, grams) ?? 0,
    fiberG: scale(n.fiberG, grams),
    sugarG: scale(n.sugarG, grams),
    satFatG: scale(n.satFatG, grams),
    sodiumMg: scale(n.sodiumMg, grams),
  }
}

/** The portions a picker offers: USDA's measures, then the bare 100 g basis. */
export function portionOptions(food: ReferenceFood): ReferencePortion[] {
  return [...food.portions, { label: "100 g", grams: 100 }]
}
