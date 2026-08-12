import { z } from "zod"

import { isValidDateString } from "@/lib/date"

// Shared by the React Hook Form resolver (client) and the Server Actions
// (server re-validation). Kept free of DB/Drizzle imports so it's client-safe.

export const PRIORITIES = ["low", "medium", "high"] as const
export type Priority = (typeof PRIORITIES)[number]

// Mirrors `statusEnum` in schema.ts. Duplicated rather than imported because this file is
// deliberately free of Drizzle imports so it stays client-safe — the same trade PRIORITIES
// already makes above.
export const STATUSES = ["open", "done"] as const

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  // date-only 'YYYY-MM-DD' (a real calendar date), or empty (no due date)
  dueDate: z
    .string()
    .refine(
      (value) => value === "" || isValidDateString(value),
      "Enter a valid date",
    )
    .optional(),
  priority: z.enum(PRIORITIES).default("medium"),
  listId: z.string().uuid("Invalid list").or(z.literal("")).optional(),
  // Optional cross-module links (T2); empty string = no link (nullified server-side).
  goalId: z.string().uuid("Invalid goal").or(z.literal("")).optional(),
  eventId: z.string().uuid("Invalid event").or(z.literal("")).optional(),
})

// The form binds to the schema's INPUT type (priority is optional pre-default).
export type TaskInput = z.input<typeof taskInputSchema>

export const TASK_RECURRENCE_FREQS = ["daily", "weekly", "monthly"] as const

// A recurring-task rule: the task template + its recurrence definition. The date is an
// anchor the schedule is computed from; instances are materialized by the generator.
export const taskRecurrenceSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    priority: z.enum(PRIORITIES).default("medium"),
    listId: z.string().uuid("Invalid list").or(z.literal("")).optional(),
    freq: z.enum(TASK_RECURRENCE_FREQS),
    recurrenceInterval: z.number().int().min(1).max(999),
    // Weekly BYDAY mask (0–127); 0 = repeat on the start date's weekday only.
    weekdays: z.number().int().min(0).max(127),
    monthlyMode: z.enum(["day_of_month", "nth_weekday"]),
    flexible: z.boolean(),
    startDate: z.string().refine(isValidDateString, "Enter a valid date"),
    endDate: z
      .string()
      .refine((v) => v === "" || isValidDateString(v), "Enter a valid date")
      .optional(),
  })
  // weekdays 0 is valid: it means "the start date's weekday" (engine fallback).
  .refine((d) => d.freq !== "daily" || !d.flexible, {
    message: "Daily repeats can't be flexible",
    path: ["flexible"],
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: "End must be on or after the start",
    path: ["endDate"],
  })

export type TaskRecurrenceInput = z.input<typeof taskRecurrenceSchema>

export const subtaskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
})

export const listInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
})

export type ListInput = z.infer<typeof listInputSchema>

/**
 * A required 'YYYY-MM-DD'. For actions that take a bare date, so none of them settles for
 * `z.string()` — an unparseable value would otherwise reach Postgres as a `date`
 * comparison and throw rather than being rejected cleanly. (Meals has its own copy;
 * validation schemas stay module-local by convention, since this file is also the
 * client-safe one and importing across modules would drag the rest of it along.)
 */
export const daySchema = z
  .string()
  .refine((v) => isValidDateString(v), "Enter a valid date")

const dayOrNull = daySchema.nullable()

/**
 * The undo payload for a deleted task. `restoreTask` is a Server Action and therefore a
 * public RPC endpoint, so a `task: Task` parameter is a compile-time annotation and guards
 * nothing at runtime. Meals got these schemas in T4-S14; this is todos catching up.
 *
 * Note these fields are NULLABLE, not the `""`-or-omitted shape `taskInputSchema` uses: that
 * one models a form, this one models a database row handed back by `.returning()`. And they
 * are nullable but NOT optional — a key that could go missing would arrive as `undefined`,
 * drizzle would skip the column, and the restored row would come back with a silent NULL,
 * which is the exact data loss restore.ts exists to prevent.
 *
 * `userId` and `updatedAt` are absent on purpose; z.object() strips unknown keys, so a
 * client-supplied userId can never reach the insert.
 */
export const restoreTaskSchema = z.object({
  id: z.string().uuid(),
  listId: z.string().uuid().nullable(),
  seriesId: z.string().uuid().nullable(),
  occurrenceDate: dayOrNull,
  goalId: z.string().uuid().nullable(),
  eventId: z.string().uuid().nullable(),
  routineId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(2000).nullable(),
  dueDate: dayOrNull,
  priority: z.enum(PRIORITIES),
  status: z.enum(STATUSES),
  sortOrder: z.number().int().min(0).max(1_000_000),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})
