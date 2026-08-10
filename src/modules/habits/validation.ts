import { z } from "zod"

import { isValidDateString } from "@/lib/date"

export const HABIT_PERIODS = ["day", "week", "month"] as const

/**
 * What a client may set on a habit — and, just as importantly, what it may not.
 *
 * Four fields on the table are deliberately absent, and their absence is the enforcement
 * rather than a note in a comment somewhere. `z.object()` strips unknown keys, so a field
 * that is not named here cannot be written by any form, any action call, or any companion
 * proposal in a later tranche.
 *
 * - **`unit` / `targetAmount`** are unread in T12a. `adherence` counts ROWS, so a habit
 *   carrying `targetAmount: 20` would read "1 of 1 done" after a single word — a number
 *   that looks right and is nonsense. They stay unwritable until something reads them.
 * - **`startDate`** is set by the action to the user's today. A habit starts when you make
 *   it; letting a client backdate one would silently rewrite its streak.
 * - **`endDate`** stays null. `archivedAt` is the only lifecycle control this tranche has,
 *   and two ways to say "this is over" — one of them filtered out of the read and one of
 *   them not — is a bug waiting to ship. The maths still honours `endDate` because an
 *   imported backup can carry one.
 */
export const habitInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  // "" is what an unset <Select> submits; normalised here so the action only ever sees
  // `string | null` and never has to care which spelling of "none" it was handed.
  goalId: z
    .union([z.string().uuid("Unknown goal."), z.literal("")])
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  period: z.enum(HABIT_PERIODS),
  targetCount: z
    .number()
    .int("Whole sessions only")
    .min(1, "At least one")
    .max(100, "That's more than a habit"),
})
export type HabitInput = z.infer<typeof habitInputSchema>

/**
 * Logging one completion.
 *
 * `onDate` is optional and normally omitted — the action resolves the user's today
 * server-side, because a client-supplied date from a device in another zone would file the
 * entry on the wrong day, and `on_date` is the column everything buckets on. It is accepted
 * at all so a later tranche can backfill ("I did go on Tuesday"). `amount` is absent for
 * the same reason `targetAmount` is.
 */
export const logEntrySchema = z.object({
  onDate: z.string().refine(isValidDateString, "Enter a valid date").optional(),
})
export type LogEntryInput = z.infer<typeof logEntrySchema>
