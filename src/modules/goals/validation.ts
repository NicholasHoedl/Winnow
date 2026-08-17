import { z } from "zod"

import { isValidDateString } from "@/lib/date"

const optionalDate = z
  .string()
  .refine((v) => v === "" || isValidDateString(v), "Enter a valid date")
  .optional()

/**
 * A measurable quantity on a goal — "30 books", "20 lbs". Nullable AND optional: null is
 * "not tracked numerically", and optional keeps the form's inferred type intact for a
 * dialog that may not render the field at all (the same shape meals uses for micros).
 */
const optionalAmount = z
  .number()
  .min(0, "Must be 0 or more")
  .max(1_000_000_000)
  .nullable()
  .optional()

export const goalInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.string().trim().max(2000).or(z.literal("")).optional(),
  targetDate: optionalDate,
  /**
   * The event this goal is aimed at.
   *
   * Same shape `habitInputSchema.goalId` uses for its optional link, and for the same
   * reason: `""` is what an unset `<Select>` submits, so it is normalised here and the
   * action only ever sees `string | null`.
   *
   * When set, `getGoals` resolves `targetDate` from the event and the typed date stops being
   * read — but it is deliberately still ACCEPTED and stored alongside, so unlinking an event
   * returns the goal to whatever date it had rather than silently clearing it.
   */
  eventId: z
    .union([z.string().uuid("Unknown event."), z.literal("")])
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  // Progress for a goal that isn't broken into milestones. `unit` is a display suffix
  // only — no conversion, no canonical list.
  targetValue: optionalAmount,
  currentValue: optionalAmount,
  unit: z.string().trim().max(20).or(z.literal("")).optional(),
})
export type GoalInput = z.infer<typeof goalInputSchema>

export const milestoneInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  dueDate: optionalDate,
})
export type MilestoneInput = z.infer<typeof milestoneInputSchema>

/**
 * The undo payload for a deleted milestone. `restoreMilestone` is a Server Action, which
 * makes it a public RPC endpoint — a `milestone: MilestoneRow` parameter is a compile-time
 * annotation and guards nothing at runtime. Meals got these schemas in T4-S14; this is
 * goals catching up.
 *
 * `userId` is deliberately absent: the session supplies it, and z.object() strips unknown
 * keys, so a client-supplied one can never reach the insert.
 */
const dayOrNull = z
  .string()
  .refine((v) => isValidDateString(v), "Invalid date")
  .nullable()

export const restoreMilestoneSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  done: z.boolean(),
  dueDate: dayOrNull,
  sortOrder: z.number().int().min(0).max(1_000_000),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})
