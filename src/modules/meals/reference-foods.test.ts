import { describe, expect, it } from "vitest"

import {
  bestReferenceFood,
  buildReferenceIndex,
  decodeReferenceFoods,
  defaultPortion,
  portionLabel,
  portionOptions,
  scaleReferenceFood,
  scoreName,
  searchReferenceFoods,
  tokenize,
  type ReferenceFile,
  type ReferenceFood,
} from "./reference-foods"

// A handful of real SR Legacy rows, in the generated file's tuple shape. The figures are
// USDA's own (per 100 g), which is what makes the scaling cases below checkable by hand.
const FILE: ReferenceFile = {
  source: "test",
  foods: [
    [
      173944,
      "Bananas, raw",
      "Fruits and Fruit Juices",
      [89, 1.09, 22.84, 0.33, 2.6, 12.23, 0.112, 1],
      [
        ["1 cup, mashed", 225],
        ["1 cup, sliced", 150],
        ['1 medium (7" to 7-7/8" long)', 118],
      ],
    ],
    [
      173945,
      "Bananas, dehydrated, or banana powder",
      "Fruits and Fruit Juices",
      [346, 3.89, 88.28, 1.81, 9.9, 47.3, 0.698, 3],
      [["1 cup", 100]],
    ],
    [
      167629,
      "Melon, banana (Navajo)",
      "American Indian/Alaska Native Foods",
      [21, 0.84, 4.06, 0.2, 0.3, 3.36, null, 11],
      [],
    ],
    [
      171077,
      "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
      "Poultry Products",
      [165, 31.02, 0, 3.57, 0, 0, 1.01, 74],
      [["1 cup, chopped or diced", 140]],
    ],
    [
      174494,
      "Soup, chicken noodle, canned, condensed",
      "Soups, Sauces, and Gravies",
      [62, 3.1, 7.4, 2.2, 0.5, 0.9, 0.6, 780],
      [["1 cup", 245]],
    ],
  ],
}

const foods = decodeReferenceFoods(FILE)
const index = buildReferenceIndex(foods)
const names = (found: ReferenceFood[]) => found.map((food) => food.name)

describe("decodeReferenceFoods", () => {
  it("expands the tuples into named fields, keeping null micros null", () => {
    const melon = foods.find((food) => food.id === 167629)!
    expect(melon.per100g.calories).toBe(21)
    expect(melon.per100g.sodiumMg).toBe(11)
    expect(melon.per100g.satFatG).toBeNull()
    expect(melon.portions).toEqual([])
    expect(foods[0].portions[2]).toEqual({
      label: '1 medium (7" to 7-7/8" long)',
      grams: 118,
    })
  })
})

describe("tokenize", () => {
  it("lower-cases, splits on punctuation and drops a plural s", () => {
    expect(tokenize("Bananas, raw")).toEqual(["banana", "raw"])
    expect(tokenize("Chicken, broilers or fryers, breast")).toEqual([
      "chicken",
      "broiler",
      "or",
      "fryer",
      "breast",
    ])
  })

  it("leaves a short word its s — 'peas' and 'eggs' are not stems of anything", () => {
    expect(tokenize("Peas, green, raw")).toEqual(["peas", "green", "raw"])
    expect(tokenize("Eggs")).toEqual(["eggs"])
  })
})

describe("searchReferenceFoods", () => {
  it("puts the plain food first, and a preparation last", () => {
    // The powder matches the head noun and is short; "dehydrated" and "powder" are what
    // put it under the melon, which at least is unprocessed.
    expect(names(searchReferenceFoods(index, "banana"))).toEqual([
      "Bananas, raw",
      "Melon, banana (Navajo)",
      "Bananas, dehydrated, or banana powder",
    ])
  })

  it("prefers the plain cut over a shorter processed name, and a brand goes last", () => {
    const extra = buildReferenceIndex(
      decodeReferenceFoods({
        source: "test",
        foods: [
          ...FILE.foods,
          [
            1,
            "Chicken breast tenders, breaded, uncooked",
            "Poultry Products",
            [255, 14.7, 15, 15.8, 0.8, 0, 3.4, 484],
            [["3 oz", 85]],
          ],
          [
            2,
            "Yogurt, Greek, Blueberry, CHOBANI",
            "Dairy and Egg Products",
            [82, 7.2, 12.8, 0.2, 0.5, 11.1, 0.1, 40],
            [],
          ],
          [
            3,
            "Yogurt, Greek, plain, lowfat",
            "Dairy and Egg Products",
            [73, 9.95, 3.94, 1.92, 0, 3.56, 1.23, 34],
            [["1 container (7 oz)", 200]],
          ],
          [
            4,
            "Oil, corn, peanut, and olive",
            "Fats and Oils",
            [884, 0, 0, 100, 0, 0, 14.4, 0],
            [["1 tablespoon", 14]],
          ],
          [
            5,
            "Oil, olive, salad or cooking",
            "Fats and Oils",
            [884, 0, 0, 100, 0, 0, 13.8, 2],
            [["1 tablespoon", 13.5]],
          ],
        ],
      }),
    )
    expect(names(searchReferenceFoods(extra, "chicken breast"))[0]).toBe(
      "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
    )
    expect(names(searchReferenceFoods(extra, "greek yogurt"))).toEqual([
      "Yogurt, Greek, plain, lowfat",
      "Yogurt, Greek, Blueberry, CHOBANI",
    ])
    // Adjacent, in order, wins the tie between two five-word oil names.
    expect(names(searchReferenceFoods(extra, "olive oil"))[0]).toBe(
      "Oil, olive, salad or cooking",
    )
  })

  it("requires every query token to land, so a qualifier cannot drag in a soup", () => {
    expect(names(searchReferenceFoods(index, "chicken breast"))).toEqual([
      "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
    ])
    expect(names(searchReferenceFoods(index, "chicken"))).toEqual([
      "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
      "Soup, chicken noodle, canned, condensed",
    ])
  })

  it("matches a prefix while you are still typing, and the plural either way", () => {
    expect(names(searchReferenceFoods(index, "ban"))[0]).toBe("Bananas, raw")
    expect(names(searchReferenceFoods(index, "bananas"))[0]).toBe(
      "Bananas, raw",
    )
  })

  it("returns nothing for nothing, and honours the limit", () => {
    expect(searchReferenceFoods(index, "   ")).toEqual([])
    expect(searchReferenceFoods(index, "xyzzy")).toEqual([])
    expect(searchReferenceFoods(index, "banana", 1)).toHaveLength(1)
  })
})

describe("scoreName", () => {
  it("scores an exact head-noun hit above a prefix deep in the name", () => {
    const head = scoreName(["banana"], ["banana", "raw"])!
    const deep = scoreName(["banana"], ["melon", "banana", "navajo"])!
    expect(head).toBeGreaterThan(deep)
  })

  it("is null when any query token misses", () => {
    expect(scoreName(["banana", "fried"], ["banana", "raw"])).toBeNull()
  })
})

describe("bestReferenceFood", () => {
  it("answers the quick-add bar when the head noun is what was typed", () => {
    expect(bestReferenceFood(index, "banana")?.name).toBe("Bananas, raw")
    expect(bestReferenceFood(index, "chicken breast")?.name).toMatch(/^Chicken/)
  })

  it("refuses a query that only lands in a food's qualifiers", () => {
    // "raw" alone would otherwise log a banana, silently and wrongly.
    expect(bestReferenceFood(index, "raw")).toBeNull()
    expect(bestReferenceFood(index, "")).toBeNull()
  })

  it("accepts the word after a group head — USDA files salmon under Fish", () => {
    const fish = buildReferenceIndex(
      decodeReferenceFoods({
        source: "test",
        foods: [
          [
            6,
            "Fish, salmon, Atlantic, farmed, cooked, dry heat",
            "Finfish and Shellfish Products",
            [206, 22.1, 0, 12.35, 0, 0, 2.5, 61],
            [["3 oz", 85]],
          ],
        ],
      }),
    )
    expect(bestReferenceFood(fish, "salmon")?.name).toMatch(/^Fish, salmon/)
  })
})

describe("portions", () => {
  it("assumes a medium when there is one, else the first measure, else 100 g", () => {
    expect(defaultPortion(foods[0]).grams).toBe(118)
    expect(defaultPortion(foods[3]).label).toBe("1 cup, chopped or diced")
    expect(defaultPortion(foods[2])).toEqual({ label: "100 g", grams: 100 })
  })

  it("labels a portion with its weight, and the bare basis as itself", () => {
    expect(portionLabel({ label: "1 cup, sliced", grams: 150 })).toBe(
      "1 cup, sliced (150 g)",
    )
    expect(portionLabel({ label: "100 g", grams: 100 })).toBe("100 g")
  })

  it("offers USDA's measures and then 100 g", () => {
    expect(portionOptions(foods[2])).toEqual([{ label: "100 g", grams: 100 }])
    expect(portionOptions(foods[0]).map((p) => p.grams)).toEqual([
      225, 150, 118, 100,
    ])
  })
})

describe("scaleReferenceFood", () => {
  it("scales every figure from 100 g to the portion, to one decimal", () => {
    const medium = scaleReferenceFood(foods[0], defaultPortion(foods[0]))
    expect(medium.name).toBe("Bananas, raw")
    expect(medium.servingLabel).toBe('1 medium (7" to 7-7/8" long) (118 g)')
    expect(medium.calories).toBe(105) // 89 × 1.18 = 105.02
    expect(medium.proteinG).toBe(1.3)
    expect(medium.carbsG).toBe(27) // 22.84 × 1.18 = 26.95, to one decimal
    expect(medium.fiberG).toBe(3.1)
    expect(medium.sodiumMg).toBe(1.2)
  })

  it("keeps an unknown micro unknown rather than scaling it to 0", () => {
    const melon = scaleReferenceFood(foods[2], { label: "100 g", grams: 100 })
    expect(melon.satFatG).toBeNull()
    expect(melon.calories).toBe(21)
  })
})
