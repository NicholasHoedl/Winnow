// Pure Open Food Facts → food mapping. No I/O, no DB — unit-testable with plain
// objects, which matters because this is where a wrong answer looks most reasonable.
// See ADR-0005 for the reasoning; the short version is that it branches on which data
// a product actually has, never on what it claims via `nutrition_data_per`.

/** Which nutriment basis a product's numbers came from. Drives a UI hint; never stored. */
export type NutrientBasis = "serving" | "100g"

/** An OFF product mapped onto this app's food shape, ready to prefill a form. */
export type ImportedFood = {
  /** OFF's `code`. "" when a result carries none. */
  barcode: string
  name: string
  servingLabel: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  // Micronutrients are genuinely optional: null means "OFF doesn't know", which is a
  // different fact from 0 and must not be flattened into it.
  fiberG: number | null
  sugarG: number | null
  sodiumMg: number | null
  satFatG: number | null
  basis: NutrientBasis
  /** True when at least one of the four macros was missing and defaulted to 0. */
  incomplete: boolean
}

// Match the caps in validation.ts, so an import can never fail foodInputSchema.
const MAX_NAME = 200
const MAX_SERVING_LABEL = 100
const MAX_MACRO = 100000

const KJ_PER_KCAL = 4.184

// The keys that decide whether a product has data on a given basis. Energy is listed
// in preference order and checked the same way in energyKcal below.
const MACRO_KEYS = [
  "energy-kcal",
  "energy-kj",
  "energy",
  "proteins",
  "carbohydrates",
  "fat",
] as const

type Nutriments = Record<string, unknown>

/**
 * OFF nutriments arrive as numbers, as numeric strings, or as junk. Anything that isn't
 * a finite, non-negative, plausibly-sized number is "unknown" — deliberately null and
 * not 0, so callers decide whether a missing value means zero or nothing.
 */
function num(value: unknown): number | null {
  let parsed: number
  if (typeof value === "number") {
    parsed = value
  } else if (typeof value === "string") {
    const trimmed = value.trim()
    // Number("") is 0, which would silently invent data out of a blank field.
    parsed = trimmed === "" ? Number.NaN : Number(trimmed)
  } else {
    parsed = Number.NaN
  }
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_MACRO) return null
  return parsed
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/** Kills float noise from unit conversion (0.0428 g × 1000 = 42.800000000000004 mg). */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** kcal on the given basis: OFF's own kcal if present, else converted from kJ. */
function energyKcal(nutriments: Nutriments, suffix: string): number | null {
  const kcal = num(nutriments[`energy-kcal_${suffix}`])
  if (kcal !== null) return kcal
  // `energy-kj_*` is explicit; bare `energy_*` is kJ by OFF convention.
  const kj =
    num(nutriments[`energy-kj_${suffix}`]) ??
    num(nutriments[`energy_${suffix}`])
  return kj === null ? null : round1(kj / KJ_PER_KCAL)
}

/**
 * The two OFF endpoints disagree about this field, so both shapes are handled:
 * the product API sends a comma-separated string (`"Ferrero,Nutella"`), the search
 * API sends an array (`["Chobani"]`). Verified against both live; assuming string
 * silently dropped the brand from every search result.
 */
function firstBrand(brands: unknown): string {
  if (Array.isArray(brands)) return str(brands[0])
  return str(brands).split(",")[0]?.trim() ?? ""
}

/**
 * A displayable name, brand-prefixed. Prefers the English name: OFF is multilingual and
 * a name in an unreadable script is a real outcome for a product scanned abroad.
 */
function buildName(product: Record<string, unknown>): string | null {
  const base =
    str(product.product_name_en) ||
    str(product.product_name) ||
    str(product.generic_name)
  if (!base) return null

  const brand = firstBrand(product.brands)
  const full =
    !brand || base.toLowerCase().startsWith(brand.toLowerCase())
      ? base
      : `${brand} ${base}`
  return full.slice(0, MAX_NAME)
}

/** Drinks should read "100 ml", not "100 g". The pack size is the reliable signal. */
function isLiquid(product: Record<string, unknown>): boolean {
  return /\bml\b/i.test(`${str(product.serving_size)} ${str(product.quantity)}`)
}

/**
 * Map one OFF product, or null when it isn't usable (no name, or no nutrition at all —
 * OFF is full of stub entries created by a scan that was never filled in).
 *
 * The one rule worth stating twice: **the two bases are never mixed.** If calories come
 * from `_serving`, so does everything else, and a macro missing on that basis becomes 0
 * rather than falling back to the 100 g figure. Mixing produces a food whose protein
 * sits on a different basis from its calories — wrong in a way that looks fine.
 */
export function mapOffProduct(raw: unknown): ImportedFood | null {
  if (typeof raw !== "object" || raw === null) return null
  const product = raw as Record<string, unknown>

  const nutriments: Nutriments =
    typeof product.nutriments === "object" && product.nutriments !== null
      ? (product.nutriments as Nutriments)
      : {}

  const name = buildName(product)
  if (!name) return null

  // The serving branch needs BOTH a label to show and at least one number on that
  // basis. A `serving_size` with no `*_serving` nutriments is decoration, and taking it
  // would relabel 100 g of data as "30 g".
  const servingSize = str(product.serving_size)
  const hasServingData = MACRO_KEYS.some(
    (key) => num(nutriments[`${key}_serving`]) !== null,
  )
  const basis: NutrientBasis =
    servingSize !== "" && hasServingData ? "serving" : "100g"
  const suffix = basis === "serving" ? "serving" : "100g"

  const calories = energyKcal(nutriments, suffix)
  const proteinG = num(nutriments[`proteins_${suffix}`])
  const carbsG = num(nutriments[`carbohydrates_${suffix}`])
  const fatG = num(nutriments[`fat_${suffix}`])

  if (
    calories === null &&
    proteinG === null &&
    carbsG === null &&
    fatG === null
  ) {
    return null
  }

  const sodiumG = num(nutriments[`sodium_${suffix}`])
  const servingLabel =
    basis === "serving" ? servingSize : isLiquid(product) ? "100 ml" : "100 g"

  return {
    barcode: str(product.code),
    name,
    servingLabel: servingLabel.slice(0, MAX_SERVING_LABEL),
    calories: calories ?? 0,
    proteinG: proteinG ?? 0,
    carbsG: carbsG ?? 0,
    fatG: fatG ?? 0,
    fiberG: num(nutriments[`fiber_${suffix}`]),
    sugarG: num(nutriments[`sugars_${suffix}`]),
    // OFF publishes sodium in GRAMS; this app's column is milligrams.
    sodiumMg: sodiumG === null ? null : round1(sodiumG * 1000),
    satFatG: num(nutriments[`saturated-fat_${suffix}`]),
    basis,
    incomplete:
      calories === null ||
      proteinG === null ||
      carbsG === null ||
      fatG === null,
  }
}
