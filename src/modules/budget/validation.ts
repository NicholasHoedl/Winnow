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
  // Added with the recurring-transaction schema. Undo has to carry them or restoring a
  // deleted bill silently detaches it from its series into an ordinary one-off.
  seriesId: z.string().uuid().nullable(),
  occurrenceDate: z
    .string()
    .refine((value) => isValidDateString(value), "Invalid date")
    .nullable(),
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

/** Catch-up ceiling for a brand-new rule. A back-dated start date is a foot-gun:
 * the action refuses to fill the ledger, and the dialog previews the count first.
 * Lives here rather than in actions.ts so the client can show the same number
 * ("use server" modules may only export async functions). */
export const MAX_INITIAL_POSTS = 60

export const TRANSACTION_RECURRENCE_FREQS = [
  "daily",
  "weekly",
  "monthly",
] as const

// A recurring bill or income: the transaction template plus its schedule. Mirrors
// taskRecurrenceSchema's recurrence half, minus `flexible` — "sometime this week"
// is meaningful for a chore, not for a payment.
export const transactionRecurrenceSchema = z
  .object({
    amount: dollars,
    type: z.enum(INCOME_EXPENSE),
    categoryId: z.string().uuid().or(z.literal("")).optional(),
    payee: z.string().trim().max(120).or(z.literal("")).optional(),
    description: z.string().trim().max(300).or(z.literal("")).optional(),
    freq: z.enum(TRANSACTION_RECURRENCE_FREQS),
    recurrenceInterval: z.number().int().min(1).max(999),
    // Weekly BYDAY mask (0–127); 0 = the start date's weekday.
    weekdays: z.number().int().min(0).max(127),
    monthlyMode: z.enum(["day_of_month", "nth_weekday"]),
    startDate: z
      .string()
      .refine((value) => isValidDateString(value), "Enter a valid date"),
    endDate: z
      .string()
      .refine(
        (value) => value === "" || isValidDateString(value),
        "Enter a valid date",
      )
      .optional(),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: "End must be on or after the start",
    path: ["endDate"],
  })

export type TransactionRecurrenceInput = z.input<
  typeof transactionRecurrenceSchema
>
