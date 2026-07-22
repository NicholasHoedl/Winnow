import { describe, expect, it } from "vitest"

import {
  centsToDollars,
  dollarsToCents,
  formatCents,
  monthKey,
  monthRange,
  summarizeMonth,
} from "./service"

describe("money helpers", () => {
  it("dollarsToCents rounds float-safely", () => {
    expect(dollarsToCents(12.1)).toBe(1210)
    expect(dollarsToCents(0.1 + 0.2)).toBe(30) // 0.30000000000000004 → 30
    expect(dollarsToCents(1234.56)).toBe(123456)
  })

  it("centsToDollars", () => {
    expect(centsToDollars(1210)).toBe(12.1)
  })

  it("formatCents (USD)", () => {
    expect(formatCents(123456)).toBe("$1,234.56")
    expect(formatCents(0)).toBe("$0.00")
  })
})

describe("month helpers", () => {
  it("monthKey → first of month", () => {
    expect(monthKey("2026-07-15")).toBe("2026-07-01")
  })

  it("monthRange spans the month, including the year rollover", () => {
    expect(monthRange("2026-07-10")).toEqual({
      start: "2026-07-01",
      nextStart: "2026-08-01",
    })
    expect(monthRange("2026-12-05")).toEqual({
      start: "2026-12-01",
      nextStart: "2027-01-01",
    })
  })
})

describe("summarizeMonth", () => {
  it("totals income/expense/net and per-category spent vs budgeted", () => {
    const summary = summarizeMonth(
      [
        { categoryId: "food", amountCents: 2000, type: "expense" },
        { categoryId: "food", amountCents: 500, type: "expense" },
        { categoryId: "rent", amountCents: 100000, type: "expense" },
        { categoryId: null, amountCents: 300, type: "expense" }, // uncategorized
        { categoryId: "salary", amountCents: 500000, type: "income" },
      ],
      [
        { categoryId: "food", amountCents: 3000 },
        { categoryId: "rent", amountCents: 100000 },
        { categoryId: "fun", amountCents: 5000 }, // budget, no spend
      ],
    )

    expect(summary.incomeCents).toBe(500000)
    expect(summary.expenseCents).toBe(102800)
    expect(summary.netCents).toBe(397200)
    expect(summary.totalBudgetedCents).toBe(108000)

    const food = summary.byCategory.find((c) => c.categoryId === "food")
    expect(food).toEqual({
      categoryId: "food",
      spentCents: 2500,
      budgetedCents: 3000,
      remainingCents: 500,
    })

    const fun = summary.byCategory.find((c) => c.categoryId === "fun")
    expect(fun).toEqual({
      categoryId: "fun",
      spentCents: 0,
      budgetedCents: 5000,
      remainingCents: 5000,
    })

    const uncategorized = summary.byCategory.find((c) => c.categoryId === null)
    expect(uncategorized).toEqual({
      categoryId: null,
      spentCents: 300,
      budgetedCents: 0,
      remainingCents: -300,
    })
  })
})
