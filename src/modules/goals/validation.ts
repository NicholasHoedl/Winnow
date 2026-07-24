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
