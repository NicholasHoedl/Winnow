import { z } from "zod"

import { isValidDateString } from "@/lib/date"

import { monthKey } from "./service"

export const INCOME_EXPENSE = ["income", "expense"] as const

// Amounts are entered in dollars and converted to integer cents in the action.
// Max keeps cents within a Postgres `integer` (int4 ≈ $21.47M): 20M dollars =
// 2,000,000,000 cents < 2,147,483,647.
const dollars = z.number().min(0, "Must be 0 or more").max(20_000_000)

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  kind: z.enum(INCOME_EXPENSE),
})
export type CategoryInput = z.infer<typeof categoryInputSchema>

export const transactionInputSchema = z.object({
  amount: dollars,
  type: z.enum(INCOME_EXPENSE),
  date: z.string().refine((value) => isValidDateString(value), "Enter a valid date"),
  categoryId: z.string().uuid().or(z.literal("")).optional(),
  description: z.string().trim().max(300).or(z.literal("")).optional(),
})
export type TransactionInput = z.infer<typeof transactionInputSchema>

export const budgetInputSchema = z.object({
  categoryId: z.string().uuid(),
  // Accepts a month key ('YYYY-MM') or a full date; setBudget normalizes via
  // monthKey, so validate the normalized first-of-month value.
  month: z
    .string()
    .refine((value) => isValidDateString(monthKey(value)), "Invalid month"),
  amount: dollars,
})
export type BudgetInput = z.infer<typeof budgetInputSchema>
