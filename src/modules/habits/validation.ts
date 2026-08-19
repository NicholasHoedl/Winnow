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
 * - **`startDate`** is set by the action to the user's today. A habit starts when you make
 *   it; letting a client backdate one would silently rewrite its streak.
 * - **`endDate`** stays null. `archivedAt` is the only lifecycle control this tranche has,
 *   and two ways to say "this is over" — one of them filtered out of the read and one of
 *   them not — is a bug waiting to ship. The maths still honours `endDate` because an
 *   imported backup can carry one.
 */
export const habitInputSchema = z
  .object({
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
    /**
     * The measured variant — "20 words a day" rather than "one session a day".
     *
     * These two were held out of this schema until T12a's note came true and something read
     * them. `adherence` counts sessions no longer: `tallyByPeriod` sums amounts when
     * `targetAmount` is set, so a habit carrying 20 now reads "12 of 20 words" rather than
     * the "1 of 1 done" that made writing them a bug.
     *
     * Not an integer, matching the column: 5.5 km and 0.25 L are things people commit to.
     * The ceiling is high rather than absent because a `real` column will happily store
     * 1e30 and every reading drawn from it becomes noise.
     */
    targetAmount: z
      .number()
      .positive("More than zero")
      .max(1_000_000, "That's more than a habit")
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    // "" is what an emptied text input submits, normalised the way `goalId` is so the action
    // only ever sees `string | null`.
    unit: z
      .string()
      .trim()
      .max(20, "Keep the unit short")
      .nullable()
      .optional()
      .transform((value) => (value ? value : null)),
  })
  /**
   * A measured habit needs BOTH, and a session habit neither.
   *
   * `resolveQuota` decides which variant a habit is from `targetAmount` alone, so an
   * amount without a unit is a habit that reads "12 of 20" with no answer to "20 what",
   * and a unit without an amount is a word the app will never print. Neither is a state
   * the dialog can produce; this is what stops anything else producing it.
   *
   * The error is attached to a real field rather than the object, because the dialog maps
   * `fieldErrors` onto inputs and a form-level message would have nowhere to land.
   */
  .superRefine((value, ctx) => {
    if (value.targetAmount !== null && value.unit === null) {
      ctx.addIssue({
        code: "custom",
        path: ["unit"],
        message: "Name the unit — words, km, pages.",
      })
    }
    if (value.unit !== null && value.targetAmount === null) {
      ctx.addIssue({
        code: "custom",
        path: ["targetAmount"],
        message: "How much, per period?",
      })
    }
  })
export type HabitInput = z.infer<typeof habitInputSchema>

/**
 * Logging one completion.
 *
 * `onDate` is optional and normally omitted — the action resolves the user's today
 * server-side, because a client-supplied date from a device in another zone would file the
 * entry on the wrong day, and `on_date` is the column everything buckets on. It is accepted
 * at all so a later tranche can backfill ("I did go on Tuesday").
 *
 * `amount` is how much this log was worth to a MEASURED habit — twelve pages, 5.5 km. It
 * is optional here and required by the action, which is the only layer that knows which
 * habit is being logged and therefore whether an amount is meaningful: a session habit
 * REJECTS one rather than storing a number nothing will read.
 */
export const logEntrySchema = z.object({
  onDate: z.string().refine(isValidDateString, "Enter a valid date").optional(),
  amount: z
    .number()
    .positive("Enter an amount above zero")
    .max(1_000_000, "That's not a log, that's a typo")
    .optional(),
})
export type LogEntryInput = z.infer<typeof logEntrySchema>
