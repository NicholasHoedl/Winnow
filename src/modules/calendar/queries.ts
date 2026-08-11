import "server-only"
import { cache } from "react"
import { and, asc, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm"

import { db } from "@/db"
import { addDays } from "@/lib/date"
import { requireUserId } from "@/lib/session"
import { preferencesFor } from "@/modules/preferences/queries"

import { newFeedToken } from "./feed-token"
import { toVCalendar } from "./ical"
import {
  calendarFeedTokens,
  calendars,
  eventExceptions,
  events,
} from "./schema"
import {
  applyExceptions,
  bucketByDay,
  expandOccurrences,
  gridRange,
  inboundOccurrenceDates,
  MAX_MOVE_DAYS,
  occurrenceKey,
  zonedDateTimeToUtc,
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

// A series can produce an occurrence in a view only if it starts before the view ends
// and its (inclusive) recurrence end is not before the view starts. This coarse filter
// over-fetches slightly; expandOccurrences then filters precisely.
//
// Both bounds are relaxed by MAX_MOVE_DAYS, because a rescheduled occurrence can reach
// a view its series otherwise has no business in: dragged backwards, it can land before
// the series even starts, and dragged forwards it can land after the series has ended.
// Unlike MAX_SPAN_DAYS this slack is exact rather than assumed — the reschedule action
// refuses a longer move, so nothing can fall outside it.
function candidateWhere(userId: string, rangeStart: string, rangeEnd: string) {
  const upper = new Date(
    `${addDays(rangeEnd, 1 + MAX_MOVE_DAYS)}T00:00:00.000Z`,
  )
  return and(
    eq(events.userId, userId),
    lt(events.startAt, upper),
    or(
      isNull(events.recurrenceEndDate),
      gte(
        events.recurrenceEndDate,
        addDays(rangeStart, -(MAX_SPAN_DAYS + MAX_MOVE_DAYS)),
      ),
    ),
  )
}

function byDateThenTime(a: EventOccurrence, b: EventOccurrence): number {
  return (
    a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")
  )
}

/**
 * Every exception that can affect the view [start, end).
 *
 * Two windows, not one. Matching on `original_date` alone was sound only while an
 * override was pinned to its own day; now that it can move, an occurrence rescheduled
 * INTO the view from outside has an original date nowhere near it, and filtering on that
 * date alone drops the row silently — the occurrence just isn't drawn, which reads as
 * data loss. So the second window matches where the override actually LANDS, comparing
 * the stored instant against the view's own boundaries in the viewer's zone.
 */
async function fetchExceptions(
  userId: string,
  seriesIds: string[],
  start: string,
  end: string,
  tz: string,
) {
  return db.query.eventExceptions.findMany({
    where: and(
      eq(eventExceptions.userId, userId),
      inArray(eventExceptions.eventId, seriesIds),
      or(
        and(
          gte(eventExceptions.originalDate, start),
          lt(eventExceptions.originalDate, end),
        ),
        and(
          gte(eventExceptions.startAt, zonedDateTimeToUtc(start, "00:00", tz)),
          lt(eventExceptions.startAt, zonedDateTimeToUtc(end, "00:00", tz)),
        ),
      ),
    ),
  })
}

// The one path every calendar read narrows to: candidate rows → expansion → exception
// overlay → sort. Takes an already-resolved userId so a caller that needs it for
// something else (the month grid) doesn't resolve the session twice.
async function rangeOccurrences(
  userId: string,
  start: string,
  end: string,
  tz: string,
): Promise<EventOccurrence[]> {
  const rows = await db.query.events.findMany({
    where: candidateWhere(userId, start, end),
  })
  if (rows.length === 0) return []

  const range = { start, end }
  const exceptions = await fetchExceptions(
    userId,
    rows.map((e) => e.id),
    start,
    end,
    tz,
  )

  const expanded = rows.flatMap((e) => expandOccurrences(e, start, end, tz))

  // An occurrence rescheduled INTO the view was never expanded — its natural date is
  // outside the range, so expandOccurrences filtered it out before the overlay could
  // move it. Expand exactly the days that need it, one per arrival, and nothing more.
  //
  // Deduped against what is already here, because "outside the range" and "not already
  // expanded" are not the same thing: a MULTI-DAY occurrence starting before the range
  // is emitted when its span reaches in, so asking for it again renders it twice once
  // the overlay has moved both copies onto the same day.
  const byId = new Map(rows.map((e) => [e.id, e]))
  const seen = new Set(expanded.map(occurrenceKey))
  for (const { eventId, date } of inboundOccurrenceDates(
    exceptions,
    range,
    tz,
  )) {
    const event = byId.get(eventId)
    if (!event) continue
    for (const occ of expandOccurrences(event, date, addDays(date, 1), tz)) {
      const key = occurrenceKey(occ)
      if (seen.has(key)) continue
      seen.add(key)
      expanded.push(occ)
    }
  }

  // `range` lets the overlay drop the mirror case: expanded inside the view, moved out.
  return applyExceptions(expanded, exceptions, tz, range).sort(byDateThenTime)
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

/**
 * Everything the .ics writer needs: raw series rows and every exception, unexpanded.
 *
 * The opposite of every other read in this file. A feed publishes the RULE — one VEVENT
 * carrying an RRULE — and lets the subscriber expand it, so running the occurrences
 * through `rangeOccurrences` first would throw away the very thing being exported (and
 * bound to a date range a feed has no business having).
 *
 * Takes an explicit userId: the subscribe route authenticates with a token and has no
 * session to resolve one from.
 */
export async function getCalendarFeedData(userId: string) {
  const [eventRows, exceptionRows] = await Promise.all([
    db.query.events.findMany({
      where: eq(events.userId, userId),
      orderBy: [asc(events.startAt), asc(events.id)],
    }),
    db.query.eventExceptions.findMany({
      where: eq(eventExceptions.userId, userId),
      orderBy: [asc(eventExceptions.originalDate), asc(eventExceptions.id)],
    }),
  ])
  return { events: eventRows, exceptions: exceptionRows }
}

/**
 * The whole calendar as an .ics document.
 *
 * Shared by the signed-in download and the token feed, so the two can never drift into
 * publishing different calendars. Takes a userId rather than resolving a session for the
 * same reason `getCalendarFeedData` does.
 *
 * The zone matters even though the output carries no zone at all: times are emitted as
 * floating wall-clock, so this is what decides WHICH wall-clock. See `toVCalendar`.
 */
export async function buildCalendarIcs(userId: string): Promise<string> {
  const [feed, preferences] = await Promise.all([
    getCalendarFeedData(userId),
    preferencesFor(userId),
  ])
  return toVCalendar(feed.events, feed.exceptions, preferences.timeZone)
}

/**
 * The user behind a feed token, or null.
 *
 * A single indexed equality on a unique column. The token is 256 random bits, so there is
 * nothing to guess and nothing for a timing difference to leak — but a caller must still
 * answer a miss the same way it answers a malformed token, or the response confirms which
 * tokens exist.
 */
export async function resolveFeedToken(token: string): Promise<string | null> {
  if (!token) return null
  const row = await db.query.calendarFeedTokens.findFirst({
    where: eq(calendarFeedTokens.token, token),
    columns: { userId: true },
  })
  return row?.userId ?? null
}

/**
 * The current user's feed token, minting one the first time it is asked for.
 *
 * Lazy creation on read, like `ensureDefaultCalendars` above: there is no signup hook to
 * provision it from, and a token nobody has looked at yet has no reason to exist.
 */
export async function getFeedToken(): Promise<string> {
  const userId = await requireUserId()
  const existing = await db.query.calendarFeedTokens.findFirst({
    where: eq(calendarFeedTokens.userId, userId),
    columns: { token: true },
  })
  if (existing) return existing.token

  const token = newFeedToken()
  const [row] = await db
    .insert(calendarFeedTokens)
    .values({ userId, token })
    // Two tabs opening Settings at once would otherwise race to insert; the loser should
    // read the winner's token, not fail.
    .onConflictDoNothing({ target: calendarFeedTokens.userId })
    .returning({ token: calendarFeedTokens.token })
  if (row) return row.token

  const winner = await db.query.calendarFeedTokens.findFirst({
    where: eq(calendarFeedTokens.userId, userId),
    columns: { token: true },
  })
  return winner!.token
}

/**
 * Flat list of event *series* (unexpanded), newest first, for pickers — e.g. linking
 * a task to an event (T2). Series-level: one row per event, not per occurrence.
 *
 * `cache()`: the app shell's always-mounted task dialog and /activity both need it.
 */
export const getEventOptions = cache(async (): Promise<EventOption[]> => {
  const userId = await requireUserId()
  return db.query.events.findMany({
    where: eq(events.userId, userId),
    columns: { id: true, title: true, startAt: true, allDay: true },
    orderBy: [desc(events.startAt)],
  })
})
