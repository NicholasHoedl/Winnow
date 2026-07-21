import { z } from "zod"

// Shared by the React Hook Form resolver (client) and the Server Actions
// (server re-validation). Kept free of DB/Drizzle imports so it's client-safe.

export const PRIORITIES = ["low", "medium", "high"] as const
export type Priority = (typeof PRIORITIES)[number]

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  // date-only 'YYYY-MM-DD', or empty (no due date)
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .or(z.literal(""))
    .optional(),
  priority: z.enum(PRIORITIES).default("medium"),
  listId: z.string().uuid("Invalid list").or(z.literal("")).optional(),
})

// The form binds to the schema's INPUT type (priority is optional pre-default).
export type TaskInput = z.input<typeof taskInputSchema>

export const listInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
})

export type ListInput = z.infer<typeof listInputSchema>
