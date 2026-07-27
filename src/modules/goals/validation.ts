import { z } from "zod"

import { isValidDateString } from "@/lib/date"

const optionalDate = z
  .string()
  .refine((v) => v === "" || isValidDateString(v), "Enter a valid date")
  .optional()

export const goalInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.string().trim().max(2000).or(z.literal("")).optional(),
  targetDate: optionalDate,
})
export type GoalInput = z.infer<typeof goalInputSchema>

export const milestoneInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
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
  createdAt: z.coerce.date(),
})
