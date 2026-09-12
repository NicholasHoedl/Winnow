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

describe("an amount that hasn't been typed yet", () => {
  // The dialog's Amount field opens EMPTY rather than at 0, so an unfilled one arrives
  // here as "" — and the only thing the person reading the error needs is what to do.
  it("asks for an amount instead of naming a type", () => {
    const result = transactionInputSchema.safeParse({
      amount: "",
      type: "expense",
      date: "2026-07-22",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe("Enter an amount")
  })

  // The custom wording is for the missing value only; every other thing that can be wrong
  // with an amount still says what IS wrong with it.
  it("keeps the range message for a number that is out of bounds", () => {
    const result = transactionInputSchema.safeParse({
      amount: -5,
      type: "expense",
      date: "2026-07-22",
    })
    expect(result.error?.issues[0].message).toBe("Must be 0 or more")
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
    seriesId: null,
    occurrenceDate: null,
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

  // Undoing the delete of an auto-posted bill has to put it back in its series.
  // Dropping these is how "skip this month's rent" would quietly turn into
  // "detach this month's rent", losing the badge and the cycle's identity.
  it("carries the series link", () => {
    const posted = {
      ...row,
      seriesId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      occurrenceDate: "2026-07-01",
    }
    const result = restoreTransactionSchema.parse(posted)
    expect(result.seriesId).toBe(posted.seriesId)
    expect(result.occurrenceDate).toBe("2026-07-01")
  })

  it("rejects a series link that isn't a uuid", () => {
    expect(
      restoreTransactionSchema.safeParse({ ...row, seriesId: "nope" }).success,
    ).toBe(false)
  })
})

/**
 * Pass 8: the messages a person actually reads when a bound is hit.
 *
 * Where a rule carried no message of its own, zod's default reached the field — "Too big:
 * expected number to be <=20000000", "…expected string to have <=120 characters",
 * "Invalid UUID". Each is a sentence about the program, printed under a box someone was
 * typing in. `enteredDollars` already had "Enter an amount"; these are the rest catching up.
 */
describe("transactionInputSchema messages", () => {
  const base = { amount: 5, type: "expense" as const, date: "2026-09-10" }

  function messageFor(over: Record<string, unknown>): string | null {
    const parsed = transactionInputSchema.safeParse({ ...base, ...over })
    return parsed.success ? null : parsed.error.issues[0].message
  }

  it("says an amount is too large in words", () => {
    expect(messageFor({ amount: 20_000_001 })).toBe("That amount is too large")
  })

  it("says how long a payee may be", () => {
    expect(messageFor({ payee: "x".repeat(121) })).toBe(
      "Keep the payee under 120 characters",
    )
  })

  it("says how long a description may be", () => {
    expect(messageFor({ description: "x".repeat(301) })).toBe(
      "Keep the description under 300 characters",
    )
  })

  // The stale-id case: a category deleted in another tab, chosen in this one.
  it("names the category rather than the shape of its id", () => {
    expect(messageFor({ categoryId: "not-a-uuid" })).toBe("Unknown category")
  })
})
