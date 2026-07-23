import { z } from "zod"

import { isValidDateString } from "@/modules/todos/service"

export const RECURRENCE_FREQS = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const optionalDate = z
  .string()
  .refine((v) => v === "" || isValidDateString(v), "Enter a valid date")
  .optional()

const optionalTime = z
  .string()
  .refine((v) => v === "" || TIME_RE.test(v), "Enter a valid time")
  .optional()

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    notes: z.string().trim().max(2000).or(z.literal("")).optional(),
    calendarId: z.string().uuid().or(z.literal("")),
    allDay: z.boolean(),
    startDate: z.string().refine(isValidDateString, "Enter a valid date"),
    startTime: optionalTime,
    endDate: optionalDate,
    endTime: optionalTime,
    recurrenceFreq: z.enum(RECURRENCE_FREQS),
    recurrenceInterval: z.number().int().min(1).max(999),
    // Weekly BYDAY mask (0–127); 0 = repeat on the start date's weekday only.
    recurrenceWeekdays: z.number().int().min(0).max(127),
    recurrenceMonthlyMode: z.enum(["day_of_month", "nth_weekday"]),
    recurrenceEndDate: optionalDate,
  })
  .refine((d) => d.allDay || !!d.startTime, {
    message: "Start time is required for a timed event",
    path: ["startTime"],
  })
  .refine(
    (d) => {
      if (!d.endDate) return true
      if (d.endDate < d.startDate) return false
      if (
        d.endDate === d.startDate &&
        !d.allDay &&
        d.startTime &&
        d.endTime &&
        d.endTime < d.startTime
      ) {
        return false
      }
      return true
    },
    { message: "End must be on or after the start", path: ["endDate"] },
  )
  .refine((d) => !d.recurrenceEndDate || d.recurrenceEndDate >= d.startDate, {
    message: "Recurrence end must be on or after the start",
    path: ["recurrenceEndDate"],
  })

export type EventInput = z.infer<typeof eventInputSchema>

// A single-occurrence override ("This event" edit). The date is fixed to the
// occurrence's original date (v1 locks it there), so there are no date inputs — only
// a time-of-day and the fields a one-off can change.
export const eventExceptionSchema = z
  .object({
    originalDate: z.string().refine(isValidDateString, "Enter a valid date"),
    title: z.string().trim().min(1, "Title is required").max(200),
    notes: z.string().trim().max(2000).or(z.literal("")).optional(),
    calendarId: z.string().uuid().or(z.literal("")),
    allDay: z.boolean(),
    startTime: optionalTime,
    endTime: optionalTime,
  })
  .refine((d) => d.allDay || !!d.startTime, {
    message: "Start time is required for a timed event",
    path: ["startTime"],
  })
  .refine(
    (d) => d.allDay || !d.startTime || !d.endTime || d.endTime >= d.startTime,
    { message: "End time must be on or after the start", path: ["endTime"] },
  )
export type EventExceptionInput = z.infer<typeof eventExceptionSchema>

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

export const calendarInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  color: z.number().int().min(1).max(6),
})
export type CalendarInput = z.infer<typeof calendarInputSchema>
