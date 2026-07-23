"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"
import { isValidDateString } from "@/modules/todos/service"

import type { EventRow } from "./queries"
import { calendars, eventExceptions, events, goals, milestones } from "./schema"
import { zonedDateTimeToUtc } from "./service"
import {
  calendarInputSchema,
  eventExceptionSchema,
  eventInputSchema,
  goalInputSchema,
  milestoneInputSchema,
  type EventExceptionInput,
  type EventInput,
} from "./validation"

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "")
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

function invalid(error: z.ZodError): ActionResult {
  return {
    ok: false,
    error: "Please fix the errors below.",
    fieldErrors: fieldErrorsFrom(error),
  }
}

function nullify(value: string | null | undefined): string | null {
  return value == null || value === "" ? null : value
}

function revalidateCalendar() {
  revalidatePath("/calendar")
  revalidatePath("/")
}

// Assemble the timestamptz instants from the form's local date/time fields.
function toTimestamps(
  d: EventInput,
  tz: string,
): { startAt: Date; endAt: Date | null } {
  const startAt = zonedDateTimeToUtc(
    d.startDate,
    d.allDay ? "00:00" : d.startTime || "00:00",
    tz,
  )
  const hasEnd = !!d.endDate || (!d.allDay && !!d.endTime)
  const endAt = hasEnd
    ? zonedDateTimeToUtc(
        d.endDate || d.startDate,
        d.allDay ? "00:00" : d.endTime || d.startTime || "00:00",
        tz,
      )
    : null
  return { startAt, endAt }
}

export async function createEvent(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = eventInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const d = parsed.data
  const { timeZone } = await getUserPreferences()
  const { startAt, endAt } = toTimestamps(d, timeZone)
  await db.insert(events).values({
    userId,
    calendarId: d.calendarId || null,
    title: d.title,
    notes: nullify(d.notes),
    startAt,
    endAt,
    allDay: d.allDay,
    recurrenceFreq: d.recurrenceFreq,
    recurrenceInterval: d.recurrenceInterval,
    recurrenceWeekdays: d.recurrenceWeekdays,
    recurrenceMonthlyMode: d.recurrenceMonthlyMode,
    recurrenceEndDate: nullify(d.recurrenceEndDate),
  })
  revalidateCalendar()
  return { ok: true }
}

export async function updateEvent(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = eventInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const d = parsed.data
  const { timeZone } = await getUserPreferences()
  const { startAt, endAt } = toTimestamps(d, timeZone)
  await db
    .update(events)
    .set({
      calendarId: d.calendarId || null,
      title: d.title,
      notes: nullify(d.notes),
      startAt,
      endAt,
      allDay: d.allDay,
      recurrenceFreq: d.recurrenceFreq,
      recurrenceInterval: d.recurrenceInterval,
      recurrenceWeekdays: d.recurrenceWeekdays,
      recurrenceMonthlyMode: d.recurrenceMonthlyMode,
      recurrenceEndDate: nullify(d.recurrenceEndDate),
    })
    .where(and(eq(events.id, id), eq(events.userId, userId)))
  revalidateCalendar()
  return { ok: true }
}

export type DeleteEventResult =
  | { ok: true; event: EventRow | null }
  | { ok: false; error: string }

export async function deleteEvent(id: string): Promise<DeleteEventResult> {
  const userId = await requireUserId()
  const [deleted] = await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.userId, userId)))
    .returning()
  revalidateCalendar()
  return { ok: true, event: deleted ?? null }
}

export async function restoreEvent(ev: EventRow): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .insert(events)
    .values({
      id: ev.id,
      userId,
      calendarId: ev.calendarId,
      title: ev.title,
      notes: ev.notes,
      startAt: ev.startAt,
      endAt: ev.endAt,
      allDay: ev.allDay,
      recurrenceFreq: ev.recurrenceFreq,
      recurrenceInterval: ev.recurrenceInterval,
      recurrenceWeekdays: ev.recurrenceWeekdays,
      recurrenceMonthlyMode: ev.recurrenceMonthlyMode,
      recurrenceEndDate: ev.recurrenceEndDate,
      createdAt: ev.createdAt,
    })
    .onConflictDoNothing()
  revalidateCalendar()
  return { ok: true }
}

// --- Per-occurrence exceptions ("This event" edit / skip) ---

// Like toTimestamps, but the date is locked to the occurrence's original date, so
// both instants land on that day (v1 keeps an edited occurrence where it was).
function exceptionTimestamps(
  d: EventExceptionInput,
  tz: string,
): { startAt: Date; endAt: Date | null } {
  const startAt = zonedDateTimeToUtc(
    d.originalDate,
    d.allDay ? "00:00" : d.startTime || "00:00",
    tz,
  )
  const endAt =
    !d.allDay && d.endTime
      ? zonedDateTimeToUtc(d.originalDate, d.endTime, tz)
      : null
  return { startAt, endAt }
}

// Confirm the series belongs to the caller before touching its exceptions.
async function ownsEvent(userId: string, eventId: string): Promise<boolean> {
  const row = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.userId, userId)),
    columns: { id: true },
  })
  return !!row
}

// Upsert a single-occurrence override (the "This event" save). Keyed on
// (eventId, originalDate); re-saving the same day replaces the prior override.
export async function setEventException(
  eventId: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = eventExceptionSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  if (!(await ownsEvent(userId, eventId))) {
    return { ok: false, error: "Event not found." }
  }

  const d = parsed.data
  const { timeZone } = await getUserPreferences()
  const { startAt, endAt } = exceptionTimestamps(d, timeZone)
  const fields = {
    canceled: false,
    startAt,
    endAt,
    allDay: d.allDay,
    title: d.title,
    notes: nullify(d.notes),
    calendarId: d.calendarId || null,
  }
  await db
    .insert(eventExceptions)
    .values({ userId, eventId, originalDate: d.originalDate, ...fields })
    .onConflictDoUpdate({
      target: [eventExceptions.eventId, eventExceptions.originalDate],
      set: { ...fields, updatedAt: new Date() },
    })
  revalidateCalendar()
  return { ok: true }
}

// Skip a single occurrence ("This event" delete). Upserts a canceled marker; any
// prior override on that day is left in place but ignored while canceled.
export async function skipOccurrence(
  eventId: string,
  originalDate: string,
): Promise<ActionResult> {
  const userId = await requireUserId()
  if (!isValidDateString(originalDate)) {
    return { ok: false, error: "Invalid date." }
  }
  if (!(await ownsEvent(userId, eventId))) {
    return { ok: false, error: "Event not found." }
  }
  await db
    .insert(eventExceptions)
    .values({ userId, eventId, originalDate, canceled: true })
    .onConflictDoUpdate({
      target: [eventExceptions.eventId, eventExceptions.originalDate],
      set: { canceled: true, updatedAt: new Date() },
    })
  revalidateCalendar()
  return { ok: true }
}

// Remove a single occurrence's exception row — un-skip or reset it to the series
// default. This is the undo target for skipOccurrence.
export async function clearEventException(
  eventId: string,
  originalDate: string,
): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .delete(eventExceptions)
    .where(
      and(
        eq(eventExceptions.userId, userId),
        eq(eventExceptions.eventId, eventId),
        eq(eventExceptions.originalDate, originalDate),
      ),
    )
  revalidateCalendar()
  return { ok: true }
}

// --- Goals ---

export async function createGoal(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = goalInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, targetDate } = parsed.data
  await db.insert(goals).values({
    userId,
    title,
    notes: nullify(notes),
    targetDate: nullify(targetDate),
  })
  revalidatePath("/calendar")
  return { ok: true }
}

export async function updateGoal(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = goalInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, targetDate } = parsed.data
  await db
    .update(goals)
    .set({ title, notes: nullify(notes), targetDate: nullify(targetDate) })
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
  revalidatePath("/calendar")
  return { ok: true }
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const userId = await requireUserId()
  await db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)))
  revalidatePath("/calendar")
  return { ok: true }
}

// --- Milestones ---

export async function addMilestone(
  goalId: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = milestoneInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .insert(milestones)
    .values({ userId, goalId, title: parsed.data.title })
  revalidatePath("/calendar")
  return { ok: true }
}

export async function toggleMilestone(
  id: string,
  done: boolean,
): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .update(milestones)
    .set({ done })
    .where(and(eq(milestones.id, id), eq(milestones.userId, userId)))
  revalidatePath("/calendar")
  return { ok: true }
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .delete(milestones)
    .where(and(eq(milestones.id, id), eq(milestones.userId, userId)))
  revalidatePath("/calendar")
  return { ok: true }
}

// --- Calendars ---

export async function createCalendar(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = calendarInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  await db.insert(calendars).values({ userId, ...parsed.data })
  revalidateCalendar()
  return { ok: true }
}

export async function updateCalendar(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = calendarInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  await db
    .update(calendars)
    .set(parsed.data)
    .where(and(eq(calendars.id, id), eq(calendars.userId, userId)))
  revalidateCalendar()
  return { ok: true }
}

export async function deleteCalendar(id: string): Promise<ActionResult> {
  const userId = await requireUserId()
  const owned = await db.query.calendars.findMany({
    where: eq(calendars.userId, userId),
    columns: { id: true },
  })
  if (owned.length <= 1) {
    return { ok: false, error: "You need at least one calendar." }
  }
  // The FK cascade removes this calendar's events along with it.
  await db
    .delete(calendars)
    .where(and(eq(calendars.id, id), eq(calendars.userId, userId)))
  revalidateCalendar()
  return { ok: true }
}
