import { describe, expect, it } from "vitest"

import {
  amountToMinor,
  type CategoryOption,
  currencyFractionDigits,
  currencySymbol,
  formatCents,
  minorToAmount,
  monthKey,
  monthRange,
  parseTransactionQuickAdd,
  savingsRate,
  summarizeMonth,
  summarizeMonths,
} from "./service"

describe("money helpers", () => {
  it("currencyFractionDigits: 2 for USD, 0 for zero-decimal JPY", () => {
    expect(currencyFractionDigits("USD")).toBe(2)
    expect(currencyFractionDigits("JPY")).toBe(0)
  })

  it("amountToMinor rounds float-safely at the currency's precision", () => {
    expect(amountToMinor(12.1, "USD")).toBe(1210)
    expect(amountToMinor(0.1 + 0.2, "USD")).toBe(30) // 0.30000000000000004 → 30
    expect(amountToMinor(1234.56, "USD")).toBe(123456)
    expect(amountToMinor(1000, "JPY")).toBe(1000) // zero-decimal: no ×100
  })

  it("minorToAmount inverts amountToMinor per currency", () => {
    expect(minorToAmount(1210, "USD")).toBe(12.1)
    expect(minorToAmount(1000, "JPY")).toBe(1000)
  })

  it("formatCents renders the currency's symbol + decimals", () => {
    expect(formatCents(123456, "USD")).toBe("$1,234.56")
    expect(formatCents(0, "USD")).toBe("$0.00")
    expect(formatCents(1000, "JPY")).toBe("¥1,000") // whole yen, no cents
  })

  it("currencySymbol picks the symbol", () => {
    expect(currencySymbol("USD")).toBe("$")
    expect(currencySymbol("JPY")).toBe("¥")
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

const CATS: CategoryOption[] = [
  { id: "c-house", name: "Housing", kind: "expense" },
  { id: "c-sal", name: "Salary", kind: "income" },
  { id: "c-bon-i", name: "Bonus", kind: "income" },
  { id: "c-bon-e", name: "Bonus", kind: "expense" },
]

describe("parseTransactionQuickAdd", () => {
  it("parses a $-marked expense", () => {
    expect(parseTransactionQuickAdd("coffee $4", CATS)).toEqual({
      amount: 4,
      type: "expense",
      categoryId: "",
      description: "coffee",
    })
  })

  it("reads a leading minus as expense and resolves the #tag", () => {
    expect(parseTransactionQuickAdd("rent -1200 #housing", CATS)).toEqual({
      amount: 1200,
      type: "expense",
      categoryId: "c-house",
      description: "rent",
    })
  })

  it("reads a leading plus as income", () => {
    expect(parseTransactionQuickAdd("+2000 paycheck", CATS)).toEqual({
      amount: 2000,
      type: "income",
      categoryId: "",
      description: "paycheck",
    })
  })

  it("parses a decimal amount", () => {
    expect(parseTransactionQuickAdd("$4.50 latte", CATS)).toEqual({
      amount: 4.5,
      type: "expense",
      categoryId: "",
      description: "latte",
    })
  })

  it("defaults to expense without a sign — keywords never flip the type", () => {
    expect(parseTransactionQuickAdd("paycheck 2000", CATS)).toEqual({
      amount: 2000,
      type: "expense",
      categoryId: "",
      description: "paycheck",
    })
  })

  it("prefers the category whose kind matches the parsed type", () => {
    expect(parseTransactionQuickAdd("+500 #bonus", CATS)?.categoryId).toBe(
      "c-bon-i",
    )
    expect(parseTransactionQuickAdd("-500 #bonus", CATS)?.categoryId).toBe(
      "c-bon-e",
    )
  })

  it("leaves categoryId empty for an unmatched #tag but still strips it", () => {
    expect(parseTransactionQuickAdd("groceries $85.20 #food", CATS)).toEqual({
      amount: 85.2,
      type: "expense",
      categoryId: "",
      description: "groceries",
    })
  })

  it("handles a comma, $ and sign together", () => {
    expect(parseTransactionQuickAdd("-$1,200 rent #housing", CATS)).toEqual({
      amount: 1200,
      type: "expense",
      categoryId: "c-house",
      description: "rent",
    })
  })

  it("falls back to a bare number when there's no $ or sign", () => {
    expect(parseTransactionQuickAdd("dinner 25 #housing", CATS)).toEqual({
      amount: 25,
      type: "expense",
      categoryId: "c-house",
      description: "dinner",
    })
  })

  it("prefers a $-marked amount over a bare number", () => {
    expect(parseTransactionQuickAdd("buy 2 coffees for $8", CATS)?.amount).toBe(
      8,
    )
  })

  it("parses a zero amount", () => {
    expect(parseTransactionQuickAdd("$0 refund", CATS)).toEqual({
      amount: 0,
      type: "expense",
      categoryId: "",
      description: "refund",
    })
  })

  it("returns null when there is no amount", () => {
    expect(parseTransactionQuickAdd("buy milk", CATS)).toBeNull()
    expect(parseTransactionQuickAdd("#housing", CATS)).toBeNull()
    expect(parseTransactionQuickAdd("   ", CATS)).toBeNull()
  })
})

describe("summarizeMonth income rollup", () => {
  const summary = summarizeMonth(
    [
      { categoryId: "salary", amountCents: 500000, type: "income" },
      { categoryId: "salary", amountCents: 100000, type: "income" },
      { categoryId: "side", amountCents: 25000, type: "income" },
      { categoryId: null, amountCents: 4000, type: "income" }, // uncategorized
      { categoryId: "food", amountCents: 2000, type: "expense" },
    ],
    [],
  )

  it("rolls income up per source category", () => {
    expect(summary.incomeByCategory).toEqual(
      expect.arrayContaining([
        { categoryId: "salary", earnedCents: 600000 },
        { categoryId: "side", earnedCents: 25000 },
        { categoryId: null, earnedCents: 4000 },
      ]),
    )
    expect(summary.incomeByCategory).toHaveLength(3)
  })

  it("keeps income OUT of byCategory, which is expense-only", () => {
    // Letting income in here would corrupt every spent-vs-budget bar that reads it.
    expect(summary.byCategory.map((c) => c.categoryId)).toEqual(["food"])
  })
})

describe("savingsRate", () => {
  function withTotals(incomeCents: number, expenseCents: number) {
    const income =
      incomeCents > 0
        ? [
            {
              categoryId: null,
              amountCents: incomeCents,
              type: "income" as const,
            },
          ]
        : []
    const expense =
      expenseCents > 0
        ? [
            {
              categoryId: null,
              amountCents: expenseCents,
              type: "expense" as const,
            },
          ]
        : []
    return summarizeMonth([...income, ...expense], [])
  }

  it("is the share of income kept", () => {
    expect(savingsRate(withTotals(100000, 25000))).toBeCloseTo(0.75)
    expect(savingsRate(withTotals(100000, 0))).toBe(1)
  })

  it("goes negative when spending exceeds income", () => {
    expect(savingsRate(withTotals(100000, 150000))).toBeCloseTo(-0.5)
  })

  it("is null with no income — not zero", () => {
    expect(savingsRate(withTotals(0, 5000))).toBeNull()
    expect(savingsRate(withTotals(0, 0))).toBeNull()
  })
})

describe("summarizeMonths", () => {
  const txns = [
    {
      categoryId: "food",
      amountCents: 1000,
      type: "expense" as const,
      date: "2026-05-04",
    },
    {
      categoryId: "food",
      amountCents: 2000,
      type: "expense" as const,
      date: "2026-05-31",
    },
    {
      categoryId: "pay",
      amountCents: 90000,
      type: "income" as const,
      date: "2026-07-01",
    },
  ]
  const budgets = [
    { categoryId: "food", amountCents: 5000, periodMonth: "2026-05-01" },
  ]

  it("buckets by month and returns one row per requested month, oldest first", () => {
    const rows = summarizeMonths(txns, budgets, [
      "2026-05",
      "2026-06",
      "2026-07",
    ])
    expect(rows.map((r) => r.month)).toEqual(["2026-05", "2026-06", "2026-07"])
    expect(rows[0].summary.expenseCents).toBe(3000)
    expect(rows[0].summary.totalBudgetedCents).toBe(5000)
    expect(rows[2].summary.incomeCents).toBe(90000)
  })

  it("zero-fills a month with no activity rather than omitting it", () => {
    const rows = summarizeMonths(txns, budgets, [
      "2026-05",
      "2026-06",
      "2026-07",
    ])
    expect(rows[1].summary).toMatchObject({
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      totalBudgetedCents: 0,
    })
    expect(rows[1].summary.byCategory).toEqual([])
  })

  it("ignores data outside the requested window", () => {
    const rows = summarizeMonths(txns, budgets, ["2026-07"])
    expect(rows).toHaveLength(1)
    expect(rows[0].summary.expenseCents).toBe(0)
    expect(rows[0].summary.incomeCents).toBe(90000)
  })

  it("returns nothing for an empty month list", () => {
    expect(summarizeMonths(txns, budgets, [])).toEqual([])
  })
})
