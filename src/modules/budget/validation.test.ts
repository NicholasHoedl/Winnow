import { describe, expect, it } from "vitest"

import { budgetInputSchema, transactionInputSchema } from "./validation"

const UUID = "00000000-0000-4000-8000-000000000000"

describe("budgetInputSchema.month", () => {
  it("accepts a 'YYYY-MM' month key (what the budgets dialog sends)", () => {
    const result = budgetInputSchema.safeParse({
      categoryId: UUID,
      month: "2026-07",
      amount: 200,
    })
    expect(result.success).toBe(true)
  })

  it("accepts a full 'YYYY-MM-DD' date", () => {
    expect(
      budgetInputSchema.safeParse({
        categoryId: UUID,
        month: "2026-07-01",
        amount: 200,
      }).success,
    ).toBe(true)
  })

  it("rejects an impossible month", () => {
    expect(
      budgetInputSchema.safeParse({
        categoryId: UUID,
        month: "2026-13",
        amount: 200,
      }).success,
    ).toBe(false)
  })

  it("rejects a non-month string", () => {
    expect(
      budgetInputSchema.safeParse({ categoryId: UUID, month: "nope", amount: 200 })
        .success,
    ).toBe(false)
  })
})

describe("amount bound (fits the integer-cents column)", () => {
  it("rejects an amount whose cents would overflow int4", () => {
    // $100M → 10,000,000,000 cents > 2,147,483,647 (int4 max)
    expect(
      transactionInputSchema.safeParse({
        amount: 100_000_000,
        type: "expense",
        date: "2026-07-22",
      }).success,
    ).toBe(false)
  })

  it("accepts an amount at the cap", () => {
    expect(
      transactionInputSchema.safeParse({
        amount: 20_000_000,
        type: "expense",
        date: "2026-07-22",
      }).success,
    ).toBe(true)
  })
})
