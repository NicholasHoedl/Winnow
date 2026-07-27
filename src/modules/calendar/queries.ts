import "server-only"
import { and, asc, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm"

import { db } from "@/db"
import { addDays } from "@/lib/date"
import { requireUserId } from "@/lib/session"

import { calendars, eventExceptions, events } from "./schema"
import {
  applyExceptions,
  bucketByDay,
  expandOccurrences,
  gridRange,
  type Occurrence,
} from "./service"

export type EventRow = typeof events.$inferSelect
export type EventOccurrence = Occurrence<EventRow>
export type Calendar = typeof calendars.$inferSelect

// Seed the two default calendars the first time a user has none (no seed-script
// exists; this also provisions the pre-existing account). Idempotent.
async function ensureDefaultCalendars(userId: string): Promise<void> {
  const existing = await db.query.calendars.findFirst({
    where: eq(calendars.userId, userId),
  })
  if (existing) return
  await db
    .insert(calendars)
    .values([
      { userId, name: "Personal", color: 1, sortOrder: 0 },
      { userId, name: "Work", color: 3, sortOrder: 1 },
    ])
    .onConflictDoNothing()
}

export async function getCalendars(): Promise<Calendar[]> {
  const userId = await requireUserId()
  await ensureDefaultCalendars(userId)
  return db.query.calendars.findMany({
    where: eq(calendars.userId, userId),
    orderBy: [asc(calendars.sortOrder), asc(calendars.createdAt)],
  })
}

// How far a multi-day occurrence is assumed to reach past the day it starts on.
// A terminated series' LAST occurrence begins on or before its recurrence end date
// but can span beyond it, so the lower bound below is relaxed by this much — the
// same kind of deliberate slack as the +1 day on `upper`. An event spanning longer
// than this would be missed on the days past the slack; a month is well beyond any
// realistic entry, and expandOccurrences filters the over-fetch precisely anyway.
const MAX_SPAN_DAYS = 31

// A series can produce an occurrence in a view only if it starts before the view
// ends and its (inclusive) recurrence end is not before the view starts. This
// coarse filter over-fetches slightly; expandOccurrences then filters precisely.
function candidateWhere(userId: string, rangeStart: string, rangeEnd: string) {
  const upper = new Date(`${addDays(rangeEnd, 1)}T00:00:00.000Z`)
  return and(
    eq(events.userId, userId),
    lt(events.startAt, upper),
    or(
      isNull(events.recurrenceEndDate),
      gte(events.recurrenceEndDate, addDays(rangeStart, -MAX_SPAN_DAYS)),
    ),
  )
}

function byDateThenTime(a: EventOccurrence, b: EventOccurrence): number {
  return (
    a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")
  )
}

// Overlay per-occurrence exceptions (edits/skips) onto expanded occurrences. Fetches
// the exceptions for the in-play series whose original date falls in [start, end) —
// v1 locks an occurrence to its original date, so that window covers every one in view.
async function overlayExceptions(
  userId: string,
  seriesIds: string[],
  occurrences: EventOccurrence[],
  start: string,
  end: string,
  tz: string,
): Promise<EventOccurrence[]> {
  if (seriesIds.length === 0) return occurrences
  const exceptions = await db.query.eventExceptions.findMany({
    where: and(
      eq(eventExceptions.userId, userId),
      inArray(eventExceptions.eventId, seriesIds),
      gte(eventExceptions.originalDate, start),
      lt(eventExceptions.originalDate, end),
    ),
  })
  return applyExceptions(occurrences, exceptions, tz)
}

// The one path every calendar read narrows to: candidate rows → expansion →
// exception overlay → sort. Takes an already-resolved userId so a caller that needs
// it for something else (the month grid) doesn't resolve the session twice.
async function rangeOccurrences(
  userId: string,
  start: string,
  end: string,
  tz: string,
): Promise<EventOccurrence[]> {
  const rows = await db.query.events.findMany({
    where: candidateWhere(userId, start, end),
  })
  const expanded = rows.flatMap((e) => expandOccurrences(e, start, end, tz))
  const occurrences = await overlayExceptions(
    userId,
    rows.map((e) => e.id),
    expanded,
    start,
    end,
    tz,
  )
  return occurrences.sort(byDateThenTime)
}

/** Occurrences overlapping an arbitrary half-open [start, end) date range, sorted.
 *  Week and day views bind to this; a week straddling two months is why it exists. */
export async function getRangeEvents(
  start: string,
  end: string,
  tz: string,
): Promise<EventOccurrence[]> {
  return rangeOccurrences(await requireUserId(), start, end, tz)
}

export async function getMonthEvents(
  month: string,
  tz: string,
  weekStartsOn = 0,
) {
  const userId = await requireUserId()
  const { grid, start, end } = gridRange(month, weekStartsOn)
  const occurrences = await rangeOccurrences(userId, start, end, tz)
  return { month, grid, byDay: bucketByDay(occurrences), occurrences }
}

/** Occurrences landing on a single day, sorted (all-day first). Dashboard uses this. */
export async function getDayEvents(
  date: string,
  tz: string,
): Promise<EventOccurrence[]> {
  return getRangeEvents(date, addDays(date, 1), tz)
}

/** Minimal shape the task-dialog event picker binds to (series-level). */
export type EventOption = {
  id: string
  title: string
  startAt: Date
  allDay: boolean
}

/** Flat list of event *series* (unexpanded), newest first, for pickers — e.g. linking
 * a task to an event (T2). Series-level: one row per event, not per occurrence. */
export async function getEventOptions(): Promise<EventOption[]> {
  const userId = await requireUserId()
  return db.query.events.findMany({
    where: eq(events.userId, userId),
    columns: { id: true, title: true, startAt: true, allDay: true },
    orderBy: [desc(events.startAt)],
  })
}
