import { describe, expect, it } from "vitest"

import {
  restoreTransactionSchema,
  setBudgetsSchema,
  transactionInputSchema,
} from "./validation"

const UUID = "00000000-0000-4000-8000-000000000000"

function budgets(month: string, amount = 200) {
  return { month, entries: [{ categoryId: UUID, amount }] }
}

describe("setBudgetsSchema.month", () => {
  it("accepts a 'YYYY-MM' month key (what the budgets dialog sends)", () => {
    expect(setBudgetsSchema.safeParse(budgets("2026-07")).success).toBe(true)
  })

  it("accepts a full 'YYYY-MM-DD' date", () => {
    expect(setBudgetsSchema.safeParse(budgets("2026-07-01")).success).toBe(true)
  })

  it("rejects an impossible month", () => {
    expect(setBudgetsSchema.safeParse(budgets("2026-13")).success).toBe(false)
  })

  it("rejects a non-month string", () => {
    expect(setBudgetsSchema.safeParse(budgets("nope")).success).toBe(false)
  })
})

describe("setBudgetsSchema.entries", () => {
  it("accepts an empty list (every category cleared)", () => {
    expect(
      setBudgetsSchema.safeParse({ month: "2026-07", entries: [] }).success,
    ).toBe(true)
  })

  it("accepts 0 — that's how the dialog clears a budget", () => {
    expect(setBudgetsSchema.safeParse(budgets("2026-07", 0)).success).toBe(true)
  })

  it("rejects a negative amount", () => {
    expect(setBudgetsSchema.safeParse(budgets("2026-07", -5)).success).toBe(
      false,
    )
  })

  it("rejects a non-uuid category id", () => {
    expect(
      setBudgetsSchema.safeParse({
        month: "2026-07",
        entries: [{ categoryId: "nope", amount: 10 }],
      }).success,
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

describe("restoreTransactionSchema (the undo payload)", () => {
  // Shaped exactly like the row deleteTransaction().returning() hands back.
  const row = {
    id: "6f1c2b3a-4d5e-4f60-8a9b-0c1d2e3f4a5b",
    userId: "11111111-1111-4111-8111-111111111111",
    categoryId: null,
    amountCents: 7700,
    type: "expense" as const,
    date: "2026-07-25",
    payee: "Landlord",
    description: "rent",
    createdAt: new Date("2026-07-25T12:00:00Z"),
    updatedAt: new Date("2026-07-25T12:00:00Z"),
  }

  it("accepts the row as returned, ignoring columns it doesn't restore", () => {
    const result = restoreTransactionSchema.safeParse(row)
    expect(result.success ? null : result.error.issues).toBeNull()
  })

  it("accepts a createdAt that crossed the wire as a string", () => {
    expect(
      restoreTransactionSchema.safeParse({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }).success,
    ).toBe(true)
  })

  it("keeps every restorable field", () => {
    const result = restoreTransactionSchema.parse(row)
    expect(result.payee).toBe("Landlord")
    expect(result.description).toBe("rent")
    expect(result.amountCents).toBe(7700)
    expect(result.date).toBe("2026-07-25")
  })

  it("rejects a row whose id isn't a uuid", () => {
    expect(
      restoreTransactionSchema.safeParse({ ...row, id: "nope" }).success,
    ).toBe(false)
  })
})
