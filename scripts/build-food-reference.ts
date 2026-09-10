// Builds the bundled reference-foods dataset from USDA FoodData Central's SR Legacy release.
//
//   1. Download the JSON release (about 13 MB zipped, 200 MB unzipped):
//      https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip
//      (the fdc.nal.usda.gov host; www.usda.gov answers "Access Denied" for the same path.)
//   2. Unzip it, then:
//      pnpm food-reference /path/to/FoodData_Central_sr_legacy_food_json_2018-04.json
//   3. Commit `src/modules/meals/reference/sr-legacy.json`.
//
// The output keeps the ten figures the food model holds, per 100 g, and each food's
// household measures — about two megabytes for 7,800 foods. The dataset is public domain
// (CC0 1.0); USDA asks that FoodData Central be named as the source, which the dialog
// does. ADR-0025.

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import type {
  ReferenceFile,
  ReferenceRow,
} from "../src/modules/meals/reference-foods"

/** FoodData Central nutrient ids, in the order the row tuple carries them. */
const NUTRIENTS = {
  calories: 1008, // Energy, kcal
  proteinG: 1003,
  carbsG: 1005, // Carbohydrate, by difference
  fatG: 1004, // Total lipid (fat)
  fiberG: 1079, // Fiber, total dietary
  sugarG: 2000, // Total Sugars
  satFatG: 1258, // Fatty acids, total saturated
  sodiumMg: 1093, // Sodium, Na — already in mg
} as const

const MAX_PORTIONS = 8

type RawFood = {
  fdcId: number
  description: string
  foodCategory?: { description?: string }
  foodNutrients: {
    nutrient: { id: number; unitName: string }
    amount?: number
  }[]
  foodPortions: {
    amount?: number
    modifier?: string
    measureUnit?: { name?: string }
    gramWeight?: number
    sequenceNumber?: number
  }[]
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function nutrient(food: RawFood, id: number): number | null {
  const hit = food.foodNutrients.find((n) => n.nutrient.id === id)
  if (!hit || typeof hit.amount !== "number" || !Number.isFinite(hit.amount))
    return null
  return round(hit.amount, 3)
}

/** "1 cup, sliced" — the amount and USDA's modifier; the unit is always "undetermined". */
function portionLabel(portion: RawFood["foodPortions"][number]): string | null {
  const amount = portion.amount ?? 1
  const unit =
    portion.measureUnit?.name && portion.measureUnit.name !== "undetermined"
      ? portion.measureUnit.name
      : ""
  const text = [round(amount, 2), unit, portion.modifier ?? ""]
    .filter((part) => part !== "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
  return text.length > 0 && text.length <= 80 ? text : null
}

function toRow(food: RawFood): ReferenceRow | null {
  const calories = nutrient(food, NUTRIENTS.calories)
  const proteinG = nutrient(food, NUTRIENTS.proteinG)
  const carbsG = nutrient(food, NUTRIENTS.carbsG)
  const fatG = nutrient(food, NUTRIENTS.fatG)
  // A food without the four macros cannot be logged honestly; SR Legacy has none such,
  // but the rule is here for the next release.
  if (
    calories === null ||
    proteinG === null ||
    carbsG === null ||
    fatG === null
  )
    return null

  const seen = new Set<string>()
  const portions: [string, number][] = [...food.foodPortions]
    .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0))
    .flatMap((portion) => {
      const grams = portion.gramWeight
      if (typeof grams !== "number" || !(grams > 0)) return []
      const label = portionLabel(portion)
      if (!label || seen.has(label.toLowerCase())) return []
      seen.add(label.toLowerCase())
      return [[label, round(grams, 1)] as [string, number]]
    })
    .slice(0, MAX_PORTIONS)

  return [
    food.fdcId,
    food.description.trim().slice(0, 200),
    food.foodCategory?.description?.trim() ?? "",
    [
      calories,
      proteinG,
      carbsG,
      fatG,
      nutrient(food, NUTRIENTS.fiberG),
      nutrient(food, NUTRIENTS.sugarG),
      nutrient(food, NUTRIENTS.satFatG),
      nutrient(food, NUTRIENTS.sodiumMg),
    ],
    portions,
  ]
}

function main() {
  const input = process.argv[2]
  if (!input) {
    console.error("usage: pnpm food-reference <path to SR Legacy json>")
    process.exit(1)
  }
  const raw = JSON.parse(readFileSync(input, "utf8")) as {
    SRLegacyFoods: RawFood[]
  }
  const foods = raw.SRLegacyFoods
  const rows = foods
    .map(toRow)
    .filter((row): row is ReferenceRow => row !== null)
    .sort((a, b) => a[1].localeCompare(b[1]))

  const file: ReferenceFile = {
    source:
      "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, SR Legacy (April 2018). fdc.nal.usda.gov. Public domain (CC0 1.0).",
    foods: rows,
  }
  const out = path.join(
    process.cwd(),
    "src/modules/meals/reference/sr-legacy.json",
  )
  const json = JSON.stringify(file)
  writeFileSync(out, json + "\n")
  console.log(
    `${rows.length} of ${foods.length} foods → ${out} (${(json.length / 1024 / 1024).toFixed(2)} MB)`,
  )
}

main()
