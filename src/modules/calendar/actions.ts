"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { type ActionResult, invalid, nullify } from "@/lib/action-result"
import { isValidDateString } from "@/lib/date"
import { revalidateHubs } from "@/lib/revalidate"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"

import type { EventRow } from "./queries"
import { calendars, eventExceptions, events } from "./schema"
import { zonedDateTimeToUtc } from "./service"
import {
  calendarInputSchema,
  eventExceptionSchema,
  eventInputSchema,
  type EventExceptionInput,
  type EventInput,
} from "./validation"

/**
 * The row id every single-item delete takes. A Server Action is a public RPC endpoint, so
 * `id: string` is a compile-time annotation and nothing more — anything can be posted. A
 * non-uuid reaches Postgres as a comparison against a `uuid` column and throws
 * `invalid input syntax for type uuid`, which surfaces as an error boundary instead of a
 * clean rejection. Ownership is enforced separately, by the userId in every where clause.
 */
const idSchema = z.string().uuid()

function revalidateCalendar() {
  revalidatePath("/calendar")
  revalidateHubs()
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
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
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
    .where(and(eq(events.id, parsedId.data), eq(events.userId, userId)))
  revalidateCalendar()
  return { ok: true }
}

export type DeleteEventResult =
  { ok: true; event: EventRow | null } | { ok: false; error: string }

export async function deleteEvent(id: unknown): Promise<DeleteEventResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  const [deleted] = await db
    .delete(events)
    .where(and(eq(events.id, parsed.data), eq(events.userId, userId)))
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
  eventId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  // Before ownsEvent, which would otherwise compare a non-uuid against events.id.
  const parsedId = idSchema.safeParse(eventId)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = eventExceptionSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  if (!(await ownsEvent(userId, parsedId.data))) {
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
    .values({
      userId,
      eventId: parsedId.data,
      originalDate: d.originalDate,
      ...fields,
    })
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
  eventId: unknown,
  originalDate: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  // Guarded before ownsEvent, which compares against events.id. The date check was
  // already here; the id half was not. Mirrors clearEventException, its undo partner.
  const parsedId = idSchema.safeParse(eventId)
  if (!parsedId.success) return invalid(parsedId.error)
  if (typeof originalDate !== "string" || !isValidDateString(originalDate)) {
    return { ok: false, error: "Invalid date." }
  }
  if (!(await ownsEvent(userId, parsedId.data))) {
    return { ok: false, error: "Event not found." }
  }
  await db
    .insert(eventExceptions)
    .values({
      userId,
      eventId: parsedId.data,
      originalDate,
      canceled: true,
    })
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
  eventId: unknown,
  originalDate: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  // Both halves of the key are guarded: this is the module's other single-item delete,
  // and it compares against a `uuid` column AND a `date` one, so either an unchecked id
  // or an unchecked date is a crash rather than a rejection. skipOccurrence above already
  // screens the date for the same reason.
  const parsed = idSchema.safeParse(eventId)
  if (!parsed.success) return invalid(parsed.error)
  if (typeof originalDate !== "string" || !isValidDateString(originalDate)) {
    return { ok: false, error: "Invalid date." }
  }

  await db
    .delete(eventExceptions)
    .where(
      and(
        eq(eventExceptions.userId, userId),
        eq(eventExceptions.eventId, parsed.data),
        eq(eventExceptions.originalDate, originalDate),
      ),
    )
  revalidateCalendar()
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
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = calendarInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  await db
    .update(calendars)
    .set(parsed.data)
    .where(and(eq(calendars.id, parsedId.data), eq(calendars.userId, userId)))
  revalidateCalendar()
  return { ok: true }
}

export async function deleteCalendar(id: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

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
    .where(and(eq(calendars.id, parsed.data), eq(calendars.userId, userId)))
  revalidateCalendar()
  return { ok: true }
}
