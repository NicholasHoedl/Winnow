import { z } from "zod"

import { isValidDateString } from "@/lib/date"

export const routineInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(1000).or(z.literal("")).optional(),
})
export type RoutineInput = z.infer<typeof routineInputSchema>

/**
 * Bounded at a year in each direction. Nothing in the domain wants a longer lead time,
 * and an unbounded integer here would let a hostile POST push a task's due date far
 * enough out to break the date arithmetic downstream.
 */
const OFFSET_LIMIT = 365

export const routineItemInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.string().trim().max(2000).or(z.literal("")).optional(),
  // Nullable AND optional: null is "no due date", and optional keeps the form's inferred
  // type intact — the same shape goals uses for its numeric fields.
  dueOffsetDays: z
    .number()
    .int("Whole days only")
    .min(-OFFSET_LIMIT)
    .max(OFFSET_LIMIT)
    .nullable()
    .optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  listId: z.string().uuid().nullable().optional(),
})
export type RoutineItemInput = z.infer<typeof routineItemInputSchema>

/** The anchor a run is measured from — today by default, but a trip has its own date. */
export const runRoutineSchema = z.object({
  anchorDate: z
    .string()
    .refine((v) => isValidDateString(v), "Enter a valid date"),
})

/**
 * The undo payload for a deleted routine item. `restoreRoutineItem` is a Server Action,
 * so a typed parameter guards nothing at runtime.
 *
 * `userId` is deliberately absent: the session supplies it, and z.object() strips unknown
 * keys, so a client-supplied one can never reach the insert.
 */
export const restoreRoutineItemSchema = z.object({
  id: z.string().uuid(),
  routineId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(2000).nullable(),
  dueOffsetDays: z
    .number()
    .int()
    .min(-OFFSET_LIMIT)
    .max(OFFSET_LIMIT)
    .nullable(),
  priority: z.enum(["low", "medium", "high"]),
  listId: z.string().uuid().nullable(),
  sortOrder: z.number().int().min(0).max(1_000_000),
  createdAt: z.coerce.date(),
})
