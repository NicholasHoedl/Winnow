import { describe, expect, it } from "vitest"

import { mapOffProduct } from "./off-mapping"

// Fixtures are trimmed real OFF shapes — the point of most of these tests is that OFF
// says one thing and means another, so the input has to look like what it really sends.

/**
 * A composite, NOT a verbatim capture: real Nutella has no `serving_size` at all. The
 * serving values here are synthetic so one fixture can exercise both branches. The
 * verified-against-live shapes are in the "real OFF responses" block at the bottom.
 */
const nutella = {
  code: "3017620422003",
  product_name: "Nutella",
  brands: "Ferrero,Nutella",
  quantity: "400 g",
  serving_size: "15 g",
  nutrition_data_per: "100g",
  nutriments: {
    "energy-kcal_100g": 539,
    "energy-kcal_serving": 80.9,
    proteins_100g: 6.3,
    proteins_serving: 0.945,
    carbohydrates_100g: 57.5,
    carbohydrates_serving: 8.63,
    fat_100g: 30.9,
    fat_serving: 4.64,
    fiber_100g: 0,
    sugars_100g: 56.3,
    sodium_100g: 0.0428,
    "saturated-fat_100g": 10.6,
  },
}

describe("mapOffProduct — which basis wins", () => {
  it("prefers serving data when there's a serving_size AND serving nutriments", () => {
    const food = mapOffProduct(nutella)
    expect(food?.basis).toBe("serving")
    expect(food?.servingLabel).toBe("15 g")
    expect(food?.calories).toBe(80.9)
    expect(food?.proteinG).toBe(0.945)
  })

  it("ignores nutrition_data_per entirely — presence of data decides", () => {
    // Declares "serving" but only ever populated the 100 g columns.
    const food = mapOffProduct({
      ...nutella,
      nutrition_data_per: "serving",
      nutriments: {
        "energy-kcal_100g": 539,
        proteins_100g: 6.3,
        carbohydrates_100g: 57.5,
        fat_100g: 30.9,
      },
    })
    expect(food?.basis).toBe("100g")
    expect(food?.servingLabel).toBe("100 g")
    expect(food?.calories).toBe(539)
  })

  it("falls back to 100 g when serving_size is present but has no numbers", () => {
    const food = mapOffProduct({
      ...nutella,
      nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3 },
    })
    expect(food?.basis).toBe("100g")
    // Crucially NOT "15 g" — that would relabel 100 g of data as a 15 g serving.
    expect(food?.servingLabel).toBe("100 g")
  })

  it("never mixes bases: a macro missing on the winning basis is 0, not the other one", () => {
    const food = mapOffProduct({
      ...nutella,
      nutriments: {
        "energy-kcal_serving": 80.9,
        proteins_serving: 0.945,
        // No carbohydrates_serving — the 100 g figure must NOT leak in.
        carbohydrates_100g: 57.5,
        fat_serving: 4.64,
      },
    })
    expect(food?.basis).toBe("serving")
    expect(food?.carbsG).toBe(0)
    expect(food?.incomplete).toBe(true)
  })

  it("labels a drink in ml", () => {
    const food = mapOffProduct({
      product_name: "Sparkling Water",
      quantity: "500 ml",
      nutriments: { "energy-kcal_100g": 0, proteins_100g: 0 },
    })
    expect(food?.servingLabel).toBe("100 ml")
  })
})

describe("mapOffProduct — units", () => {
  it("converts sodium from grams to milligrams", () => {
    // The single most likely unit bug in the feature: OFF publishes grams. Blanking
    // serving_size forces the 100 g branch, which is where this fixture's sodium lives.
    const food = mapOffProduct({ ...nutella, serving_size: "" })
    expect(food?.basis).toBe("100g")
    expect(food?.sodiumMg).toBe(42.8)
  })

  it("converts kJ to kcal when no kcal value exists", () => {
    const food = mapOffProduct({
      product_name: "Oats",
      nutriments: { energy_100g: 1500, proteins_100g: 13 },
    })
    // 1500 / 4.184 = 358.51…
    expect(food?.calories).toBe(358.5)
  })

  it("prefers an explicit kcal value over the kJ one", () => {
    const food = mapOffProduct({
      product_name: "Oats",
      nutriments: {
        "energy-kcal_100g": 360,
        energy_100g: 1500,
        proteins_100g: 13,
      },
    })
    expect(food?.calories).toBe(360)
  })
})

describe("mapOffProduct — dirty input", () => {
  it("coerces numeric strings", () => {
    const food = mapOffProduct({
      product_name: "Rice",
      nutriments: { "energy-kcal_100g": "130", proteins_100g: "2.7" },
    })
    expect(food?.calories).toBe(130)
    expect(food?.proteinG).toBe(2.7)
  })

  it("treats blank and non-numeric values as unknown, not zero", () => {
    const food = mapOffProduct({
      product_name: "Rice",
      nutriments: {
        "energy-kcal_100g": 130,
        proteins_100g: "  ",
        fiber_100g: "n/a",
        sugars_100g: "",
      },
    })
    // A macro falls back to 0 because the column is NOT NULL…
    expect(food?.proteinG).toBe(0)
    // …but a micronutrient stays null, because "unknown" is not "none".
    expect(food?.fiberG).toBeNull()
    expect(food?.sugarG).toBeNull()
  })

  it("rejects negative and absurd values rather than passing them to Zod", () => {
    const food = mapOffProduct({
      product_name: "Broken",
      nutriments: {
        "energy-kcal_100g": 200,
        proteins_100g: -5,
        carbohydrates_100g: 9_999_999,
        fiber_100g: -1,
      },
    })
    expect(food?.proteinG).toBe(0)
    expect(food?.carbsG).toBe(0)
    expect(food?.fiberG).toBeNull()
  })

  it("returns null for a stub with a name but no nutrition at all", () => {
    expect(
      mapOffProduct({ code: "123", product_name: "Mystery", nutriments: {} }),
    ).toBeNull()
  })

  it("returns null when there is no usable name", () => {
    expect(
      mapOffProduct({ code: "123", nutriments: { "energy-kcal_100g": 100 } }),
    ).toBeNull()
  })

  it("returns null for non-objects", () => {
    expect(mapOffProduct(null)).toBeNull()
    expect(mapOffProduct("nope")).toBeNull()
    expect(mapOffProduct(undefined)).toBeNull()
  })

  it("survives a missing nutriments object", () => {
    expect(mapOffProduct({ product_name: "Bare" })).toBeNull()
  })
})

describe("mapOffProduct — naming", () => {
  it("prefixes the first brand", () => {
    expect(mapOffProduct(nutella)?.name).toBe("Ferrero Nutella")
  })

  it("doesn't double the brand when the name already starts with it", () => {
    const food = mapOffProduct({
      ...nutella,
      product_name: "Ferrero Rocher",
      brands: "Ferrero",
    })
    expect(food?.name).toBe("Ferrero Rocher")
  })

  it("prefers the English name", () => {
    const food = mapOffProduct({
      ...nutella,
      product_name: "Pâte à tartiner",
      product_name_en: "Hazelnut spread",
      brands: "",
    })
    expect(food?.name).toBe("Hazelnut spread")
  })

  it("falls back to generic_name", () => {
    const food = mapOffProduct({
      generic_name: "Chocolate spread",
      nutriments: { "energy-kcal_100g": 500 },
    })
    expect(food?.name).toBe("Chocolate spread")
  })

  it("caps a runaway name at the column limit", () => {
    const food = mapOffProduct({
      product_name: "x".repeat(500),
      nutriments: { "energy-kcal_100g": 100 },
    })
    expect(food?.name).toHaveLength(200)
  })
})

// Trimmed from actual responses to world.openfoodfacts.org/api/v2 on 2026-07-25. These
// exist because hand-written fixtures kept being more optimistic than the real thing.
describe("mapOffProduct — real OFF responses", () => {
  it("handles a product with no serving_size at all (Nutella)", () => {
    // The single most-cited OFF product declares nutrition_data_per "100g" AND has no
    // serving_size — the fallback branch is the common case, not the exotic one.
    const food = mapOffProduct({
      code: "3017620422003",
      product_name: "Nutella",
      quantity: "",
      nutrition_data_per: "100g",
      nutriments: {
        "energy-kcal_100g": 539,
        "energy-kj_100g": 2255,
        proteins_100g: 6.3,
        carbohydrates_100g: 57.5,
        fat_100g: 30.9,
        sugars_100g: 56.3,
        sodium_100g: 0.0428,
        "saturated-fat_100g": 10.6,
        // No fiber_100g — OFF simply doesn't carry it for this product.
      },
    })
    expect(food?.basis).toBe("100g")
    expect(food?.servingLabel).toBe("100 g")
    expect(food?.sodiumMg).toBe(42.8)
    expect(food?.fiberG).toBeNull()
  })

  it("takes the serving branch for a drink and keeps OFF's own label", () => {
    // Note nutrition_data_per says "100g" while serving data is fully populated —
    // the exact case that makes trusting that field wrong.
    const food = mapOffProduct({
      code: "5449000000996",
      product_name: "coca-cola",
      quantity: "33 cl",
      serving_size: "1 portion (330 ml)",
      nutrition_data_per: "100g",
      nutriments: {
        "energy-kcal_100g": 42,
        "energy-kcal_serving": 139,
        proteins_serving: 0,
        carbohydrates_serving: 35,
        fat_serving: 0,
        sodium_serving: 0,
      },
    })
    expect(food?.basis).toBe("serving")
    expect(food?.servingLabel).toBe("1 portion (330 ml)")
    expect(food?.calories).toBe(139)
  })

  it("reads brands from the search API's array shape", () => {
    // The search endpoint sends ["Chobani"]; the product endpoint sends "Ferrero,Nutella".
    // Handling only the string silently dropped the brand from every search result.
    const food = mapOffProduct({
      code: "0894700010137",
      product_name: "Nonfat Greek Yogurt",
      generic_name: "Greek Yogurt",
      brands: ["Chobani"],
      quantity: "32 OZ",
      nutriments: {
        "energy-kcal_100g": 52.9,
        proteins_100g: 9.41,
        carbohydrates_100g: 3.53,
        fat_100g: 0,
        sugars_100g: 3.53,
        sodium_100g: 0.0382,
      },
    })
    expect(food?.name).toBe("Chobani Nonfat Greek Yogurt")
    expect(food?.basis).toBe("100g")
    expect(food?.sodiumMg).toBe(38.2)
  })

  it("converts a US product's per-serving sodium to mg", () => {
    // 0.112 g sodium per 28 g serving → 112 mg, the number on the packet.
    const food = mapOffProduct({
      code: "0038000138416",
      product_name: "Original Potato Crisps",
      brands: "Pringles",
      serving_size: "1 serving (28 g)",
      nutriments: {
        "energy-kcal_serving": 150,
        proteins_serving: 1.74,
        carbohydrates_serving: 14,
        fat_serving: 8.68,
        fiber_serving: 1.15,
        sodium_serving: 0.112,
      },
    })
    expect(food?.name).toBe("Pringles Original Potato Crisps")
    expect(food?.sodiumMg).toBe(112)
    expect(food?.fiberG).toBe(1.15)
  })
})

describe("mapOffProduct — completeness flag", () => {
  it("is false when all four macros are present", () => {
    expect(mapOffProduct(nutella)?.incomplete).toBe(false)
  })

  it("is true when energy is missing entirely", () => {
    const food = mapOffProduct({
      product_name: "Salt",
      nutriments: { proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 },
    })
    expect(food?.calories).toBe(0)
    expect(food?.incomplete).toBe(true)
  })
})
