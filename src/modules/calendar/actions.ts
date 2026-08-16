"use server"

import { revalidatePath } from "next/cache"
import { and, eq, gte } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { type ActionResult, invalid, nullify } from "@/lib/action-result"
import { isValidDateString } from "@/lib/date"
import { revalidateHubs } from "@/lib/revalidate"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"

import { newFeedToken } from "./feed-token"
import type { EventRow } from "./queries"
import {
  calendarFeedTokens,
  calendars,
  eventExceptions,
  events,
} from "./schema"
import { localDateTime, splitSeriesAt, zonedDateTimeToUtc } from "./service"
import {
  calendarInputSchema,
  eventExceptionSchema,
  eventInputSchema,
  rescheduleSchema,
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

/**
 * Confirm a client-supplied `calendarId` belongs to the caller.
 *
 * The column is a plain foreign key to a table that also carries a `user_id`, and
 * Postgres has no opinion about whether the pair belongs to the same person — the FK
 * only proves the row exists. Same hole `checkTaskLinks` closed for to-dos, and it bites
 * harder here: `events.calendar_id` cascades on delete, so an event pointed at someone
 * else's calendar is an event THEY can destroy by tidying up their own.
 */
async function checkCalendar(
  userId: string,
  calendarId: string,
): Promise<string | null> {
  if (!calendarId) return null
  const row = await db.query.calendars.findFirst({
    where: and(eq(calendars.id, calendarId), eq(calendars.userId, userId)),
    columns: { id: true },
  })
  return row ? null : "Unknown calendar."
}

/** The event fields a form submission fully specifies. */
function eventFields(d: EventInput, startAt: Date, endAt: Date | null) {
  return {
    calendarId: d.calendarId || null,
    title: d.title,
    notes: nullify(d.notes),
    startAt,
    endAt,
    allDay: d.allDay,
    highlighted: d.highlighted,
    recurrenceFreq: d.recurrenceFreq,
    recurrenceInterval: d.recurrenceInterval,
    recurrenceWeekdays: d.recurrenceWeekdays,
    recurrenceMonthlyMode: d.recurrenceMonthlyMode,
    recurrenceEndDate: nullify(d.recurrenceEndDate),
  }
}

export async function createEvent(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = eventInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const d = parsed.data
  const calendarError = await checkCalendar(userId, d.calendarId)
  if (calendarError) return { ok: false, error: calendarError }
  const { timeZone } = await getUserPreferences()
  const { startAt, endAt } = toTimestamps(d, timeZone)
  await db.insert(events).values({ userId, ...eventFields(d, startAt, endAt) })
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
  const calendarError = await checkCalendar(userId, d.calendarId)
  if (calendarError) return { ok: false, error: calendarError }
  const { timeZone } = await getUserPreferences()
  const { startAt, endAt } = toTimestamps(d, timeZone)
  await db
    .update(events)
    .set(eventFields(d, startAt, endAt))
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
      // Listed by hand because this whole object is. Leave it out and undoing a delete
      // silently un-highlights the event — the row comes back, but not as it was.
      highlighted: ev.highlighted,
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

// --- "This and following" ---

/**
 * Apply an edit from one occurrence onward: stop the original the day before, and start
 * a fresh series carrying the edit from that date.
 *
 * `updateEvent` could not be extended to do this — it takes no date context, so it has
 * no way to know where "from here" begins.
 *
 * `fromDate` is the occurrence's ORIGINAL date, the one the series would produce it on.
 * A moved occurrence sits somewhere else, but the boundary is about the series, and the
 * series only knows its natural dates.
 */
export async function splitSeriesFrom(
  eventId: unknown,
  fromDate: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(eventId)
  if (!parsedId.success) return invalid(parsedId.error)
  if (typeof fromDate !== "string" || !isValidDateString(fromDate)) {
    return { ok: false, error: "Invalid date." }
  }
  const parsed = eventInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const d = parsed.data
  const existing = await db.query.events.findFirst({
    where: and(eq(events.id, parsedId.data), eq(events.userId, userId)),
  })
  if (!existing) return { ok: false, error: "Event not found." }
  if (existing.recurrenceFreq === "none") {
    return { ok: false, error: "This event does not repeat." }
  }
  const calendarError = await checkCalendar(userId, d.calendarId)
  if (calendarError) return { ok: false, error: calendarError }

  const { timeZone } = await getUserPreferences()
  const { startAt, endAt } = toTimestamps(d, timeZone)
  const fields = eventFields(d, startAt, endAt)

  // Splitting at the series' own first occurrence leaves nothing behind, so it is just
  // an edit of the whole thing. Writing the split anyway would strand a truncated row
  // that produces no occurrences at all.
  const anchorDate = localDateTime(existing.startAt, timeZone).date
  if (fromDate <= anchorDate) {
    await db
      .update(events)
      .set(fields)
      .where(and(eq(events.id, parsedId.data), eq(events.userId, userId)))
    revalidateCalendar()
    return { ok: true }
  }
  if (d.startDate < fromDate) {
    return { ok: false, error: "The new series cannot start before the split." }
  }

  // The truncation point comes from splitSeriesAt so the inclusive-end arithmetic has
  // exactly one definition, and one that is covered by tests expanding both halves and
  // comparing them against the original.
  const { head } = splitSeriesAt(existing, fromDate, {})

  // One transaction. A truncate that lands without its continuation silently deletes
  // every future occurrence; a continuation without its truncate renders the series
  // twice from the split onward. Neither half is meaningful alone.
  await db.transaction(async (tx) => {
    await tx
      .update(events)
      .set({ recurrenceEndDate: head.recurrenceEndDate })
      .where(and(eq(events.id, parsedId.data), eq(events.userId, userId)))

    const [created] = await tx
      .insert(events)
      .values({ userId, ...fields })
      .returning({ id: events.id })

    // Per-occurrence edits from the split date onward belong to the continuation, per
    // the tranche's locked decision. Re-pointing them cannot collide: the unique key is
    // (event_id, original_date) and the new series has none of its own yet.
    await tx
      .update(eventExceptions)
      .set({ eventId: created.id })
      .where(
        and(
          eq(eventExceptions.userId, userId),
          eq(eventExceptions.eventId, parsedId.data),
          gte(eventExceptions.originalDate, fromDate),
        ),
      )
  })
  revalidateCalendar()
  return { ok: true }
}

export type DeleteFollowingResult =
  | { ok: true; kind: "truncated"; previousEndDate: string | null }
  | { ok: true; kind: "deleted"; event: EventRow }
  | { ok: false; error: string }

/**
 * Stop a series from one occurrence onward — the delete counterpart of the split, and
 * only its truncating half.
 *
 * Undo is why the result is a union. Truncating is reversed by putting the old
 * recurrence end back, but a split at the FIRST occurrence removes the row outright and
 * has to be undone by `restoreEvent` instead. Reporting which happened is cheaper than
 * making the caller work it out.
 *
 * Exceptions past the cut are deliberately left in place. They describe occurrences that
 * no longer exist, so they are inert — and keeping them is what lets undo restore the
 * series exactly as it was rather than approximately.
 */
export async function deleteSeriesFrom(
  eventId: unknown,
  fromDate: unknown,
): Promise<DeleteFollowingResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(eventId)
  if (!parsedId.success) return invalid(parsedId.error)
  if (typeof fromDate !== "string" || !isValidDateString(fromDate)) {
    return { ok: false, error: "Invalid date." }
  }

  const existing = await db.query.events.findFirst({
    where: and(eq(events.id, parsedId.data), eq(events.userId, userId)),
  })
  if (!existing) return { ok: false, error: "Event not found." }

  const { timeZone } = await getUserPreferences()
  if (fromDate <= localDateTime(existing.startAt, timeZone).date) {
    const [deleted] = await db
      .delete(events)
      .where(and(eq(events.id, parsedId.data), eq(events.userId, userId)))
      .returning()
    revalidateCalendar()
    return { ok: true, kind: "deleted", event: deleted ?? existing }
  }

  const { head } = splitSeriesAt(existing, fromDate, {})
  await db
    .update(events)
    .set({ recurrenceEndDate: head.recurrenceEndDate })
    .where(and(eq(events.id, parsedId.data), eq(events.userId, userId)))
  revalidateCalendar()
  return {
    ok: true,
    kind: "truncated",
    previousEndDate: existing.recurrenceEndDate,
  }
}

/** Undo for the truncating half of `deleteSeriesFrom`. */
export async function setSeriesEnd(
  eventId: unknown,
  endDate: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(eventId)
  if (!parsedId.success) return invalid(parsedId.error)
  if (
    endDate !== null &&
    (typeof endDate !== "string" || !isValidDateString(endDate))
  ) {
    return { ok: false, error: "Invalid date." }
  }
  await db
    .update(events)
    .set({ recurrenceEndDate: endDate })
    .where(and(eq(events.id, parsedId.data), eq(events.userId, userId)))
  revalidateCalendar()
  return { ok: true }
}

// --- Per-occurrence exceptions ("This event" edit / skip) ---

/**
 * The instants a single occurrence lands on.
 *
 * `date` is where it goes and defaults to `originalDate`, which stays the key it is
 * found by either way. This used to build both instants from `originalDate`
 * unconditionally, which is what pinned an edited occurrence to its own day — the lock
 * lived here rather than in the schema, so a crafted payload could not move a day even
 * though nothing validated one.
 *
 * The day is stored in the instant itself, so there is no separate column to keep in
 * step with it — and no way for the two to disagree about the same occurrence.
 */
function exceptionTimestamps(
  d: Pick<
    EventExceptionInput,
    "originalDate" | "date" | "endDate" | "allDay" | "startTime" | "endTime"
  >,
  tz: string,
): { startAt: Date; endAt: Date | null } {
  const date = d.date || d.originalDate
  const startAt = zonedDateTimeToUtc(
    date,
    d.allDay ? "00:00" : d.startTime || "00:00",
    tz,
  )
  // A multi-day occurrence keeps its span: endDate carries the far end, and an
  // end time alone means it finishes on the same day.
  const hasEnd = !!d.endDate || (!d.allDay && !!d.endTime)
  const endAt = hasEnd
    ? zonedDateTimeToUtc(
        d.endDate || date,
        d.allDay ? "00:00" : d.endTime || d.startTime || "00:00",
        tz,
      )
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
  const calendarError = await checkCalendar(userId, d.calendarId)
  if (calendarError) return { ok: false, error: calendarError }
  const { timeZone } = await getUserPreferences()
  const { startAt, endAt } = exceptionTimestamps(d, timeZone)
  const fields = {
    canceled: false,
    startAt,
    endAt,
    allDay: d.allDay,
    highlighted: d.highlighted,
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

/**
 * Move one occurrence of a series to another day and time (drag-to-reschedule).
 *
 * Writes the same exception row a "This event" edit does — a move IS an override, it
 * just happens to change the day — but takes only what a drag knows, so the grid does
 * not have to carry a whole event around to move a block. Fields it says nothing about
 * (title, notes, calendar) stay null and keep inheriting from the series, which is what
 * makes a later rename of the series still reach a moved occurrence.
 *
 * Deliberately clears `canceled`: dropping a block onto a day is an unambiguous
 * statement that the occurrence should be there.
 */
export async function rescheduleOccurrence(
  eventId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  // Before ownsEvent, which would otherwise compare a non-uuid against events.id.
  const parsedId = idSchema.safeParse(eventId)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = rescheduleSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  if (!(await ownsEvent(userId, parsedId.data))) {
    return { ok: false, error: "Event not found." }
  }

  const d = parsed.data
  const { timeZone } = await getUserPreferences()
  const { startAt, endAt } = exceptionTimestamps(d, timeZone)
  // Deliberately narrow — and `highlighted` is deliberately NOT here. Moving an occurrence
  // says nothing about whether it is worth surfacing early, so it must keep inheriting
  // rather than be pinned to whatever the series said at the moment of the drag.
  const fields = { canceled: false, startAt, endAt, allDay: d.allDay }
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

/**
 * Replace the subscribe-feed token, invalidating the old URL.
 *
 * This is the only revocation there is: a bearer URL cannot be un-shared, so the answer to
 * a leaked feed link is to make it stop working. Any calendar already subscribed to the
 * old URL starts failing and has to be re-added, which the UI says out loud before asking.
 */
export async function regenerateFeedToken(): Promise<ActionResult> {
  const userId = await requireUserId()
  const token = newFeedToken()

  await db
    .insert(calendarFeedTokens)
    .values({ userId, token })
    .onConflictDoUpdate({
      target: calendarFeedTokens.userId,
      set: { token, createdAt: new Date() },
    })

  // The settings page renders the URL, so it has to re-read.
  revalidatePath("/settings")
  return { ok: true }
}
