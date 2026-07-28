import { z } from "zod"

import { dayDiff, isValidDateString } from "@/lib/date"

import { MAX_MOVE_DAYS } from "./service"

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

/** Neither end of a move may drift further than the series intends. Shared by the
 *  override and reschedule schemas, since either can now carry a date. */
const withinMoveLimit = (d: { originalDate: string; date?: string }) =>
  !d.date || Math.abs(dayDiff(d.originalDate, d.date)) <= MAX_MOVE_DAYS

const moveLimitMessage = `Move an occurrence within ${MAX_MOVE_DAYS} days of its original date`

// A single-occurrence override ("This event" edit). `originalDate` is the RECURRENCE-ID
// the occurrence is found by and never changes; `date` is where it actually lands, and
// defaults to `originalDate` when the caller doesn't move it.
export const eventExceptionSchema = z
  .object({
    originalDate: z.string().refine(isValidDateString, "Enter a valid date"),
    date: optionalDate,
    endDate: optionalDate,
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
  .refine(withinMoveLimit, { message: moveLimitMessage, path: ["date"] })
export type EventExceptionInput = z.infer<typeof eventExceptionSchema>

// A drag-to-reschedule: move one occurrence to another day and time, keeping everything
// else. Deliberately not the override schema — a drag has no title to send, and
// requiring one would mean the grid had to carry the whole event just to move it.
export const rescheduleSchema = z
  .object({
    originalDate: z.string().refine(isValidDateString, "Enter a valid date"),
    date: z.string().refine(isValidDateString, "Enter a valid date"),
    /** Keeps a multi-day occurrence's span; defaults to `date`. */
    endDate: optionalDate,
    allDay: z.boolean(),
    startTime: optionalTime,
    endTime: optionalTime,
  })
  .refine((d) => d.allDay || !!d.startTime, {
    message: "Start time is required for a timed event",
    path: ["startTime"],
  })
  .refine((d) => !d.endDate || d.endDate >= d.date, {
    message: "End must be on or after the start",
    path: ["endDate"],
  })
  .refine(withinMoveLimit, { message: moveLimitMessage, path: ["date"] })
export type RescheduleInput = z.infer<typeof rescheduleSchema>

export const calendarInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  color: z.number().int().min(1).max(6),
})
export type CalendarInput = z.infer<typeof calendarInputSchema>
