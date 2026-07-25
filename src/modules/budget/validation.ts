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
  date: z
    .string()
    .refine((value) => isValidDateString(value), "Enter a valid date"),
  categoryId: z.string().uuid().or(z.literal("")).optional(),
  payee: z.string().trim().max(120).or(z.literal("")).optional(),
  description: z.string().trim().max(300).or(z.literal("")).optional(),
})
export type TransactionInput = z.infer<typeof transactionInputSchema>

// Undo hands back a row the client was holding, so it gets validated like any other
// input. Listing every restorable column here (rather than in the action) means a
// new column can't be silently dropped on restore.
export const restoreTransactionSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  // Already minor units — bounded by the same int4 ceiling as `dollars`.
  amountCents: z.number().int().min(0).max(2_000_000_000),
  type: z.enum(INCOME_EXPENSE),
  date: z.string().refine((value) => isValidDateString(value), "Invalid date"),
  payee: z.string().max(120).nullable(),
  description: z.string().max(300).nullable(),
  createdAt: z.coerce.date(),
})

// Accepts a month key ('YYYY-MM') or a full date; the actions normalize via
// monthKey, so validate the normalized first-of-month value.
const monthField = z
  .string()
  .refine((value) => isValidDateString(monthKey(value)), "Invalid month")

// The dialog submits every expense category at once so the whole month is written
// in a single transaction. An amount of 0 (or a cleared field) clears that budget.
export const setBudgetsSchema = z.object({
  month: monthField,
  entries: z
    .array(z.object({ categoryId: z.string().uuid(), amount: dollars }))
    .max(200, "Too many categories"),
})
export type SetBudgetsInput = z.infer<typeof setBudgetsSchema>

export const copyBudgetsSchema = z.object({
  fromMonth: monthField,
  toMonth: monthField,
})
