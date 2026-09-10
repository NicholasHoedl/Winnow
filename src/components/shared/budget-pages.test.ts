import { describe, expect, it } from "vitest"

import { BUDGET_PAGES, withMonth } from "./budget-pages"

describe("withMonth", () => {
  it("carries a month onto a pill", () => {
    expect(withMonth("/budget/budgets", "2027-06")).toBe(
      "/budget/budgets?month=2027-06",
    )
  })

  it("leaves the pill bare with no month, or with one that is not a month", () => {
    // The pages validate the param themselves, but a link should not carry what it
    // knows is junk.
    expect(withMonth("/budget", null)).toBe("/budget")
    expect(withMonth("/budget", undefined)).toBe("/budget")
    expect(withMonth("/budget", "2027-6")).toBe("/budget")
    expect(withMonth("/budget", "garbage")).toBe("/budget")
  })
})

describe("BUDGET_PAGES", () => {
  it("starts with the hub, and every other page sits under it", () => {
    // The strip matches the hub exactly and the rest by prefix; a page outside `/budget`
    // would never light, and a second `/budget` entry would light twice.
    expect(BUDGET_PAGES[0].href).toBe("/budget")
    for (const page of BUDGET_PAGES.slice(1)) {
      expect(page.href.startsWith("/budget/")).toBe(true)
    }
    expect(new Set(BUDGET_PAGES.map((p) => p.href)).size).toBe(
      BUDGET_PAGES.length,
    )
  })
})
