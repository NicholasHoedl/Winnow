// Pure iCalendar (RFC 5545) serialization. No DB and no `server-only`, so it unit-tests
// directly — same contract as service.ts and components/calendar/grid-geometry.ts.
//
// Write-only, deliberately. Emitting our five recurrence columns as an RRULE is a mapping
// problem and every one of the known gaps is solvable on the way out. Reading an arbitrary
// RRULE back in is a *representability* problem — COUNT, BYSETPOS, multi-BYDAY-with-ordinals
// and the rest have nowhere to live in this schema — which is a different feature needing a
// different answer. See docs/adr/0008-*.md.

import { addDays, dowOf, parse } from "@/lib/date"

import { localDateTime, nthWeekdayOf, type RecurringEvent } from "./service"

/** Only the fields the writer reads; callers pass their full rows. */
export type IcalEvent = RecurringEvent & {
  id: string
  title: string
  notes: string | null
  updatedAt: Date | string
}

/** A per-occurrence override or cancellation, as stored in `event_exceptions`. */
export type IcalException = {
  eventId: string
  originalDate: string
  canceled: boolean
  startAt: Date | string | null
  endAt: Date | string | null
  allDay: boolean | null
  title: string | null
  notes: string | null
  updatedAt: Date | string
}

// RFC 5545 caps a content line at 75 octets. Counting OCTETS rather than characters is
// the whole subtlety: a fold placed inside a multi-byte sequence corrupts it, and `notes`
// is free text that will eventually contain one.
const MAX_OCTETS = 75
const UTF8 = new TextEncoder()

// BYDAY codes indexed by weekday number, matching `dowOf` (0 = Sunday).
const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const

/** Escape a TEXT value (RFC 5545 §3.3.11). `:` is deliberately not escaped. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n")
}

/**
 * Fold one content line to 75 octets, continuations prefixed with a space (§3.1).
 *
 * Iterating with `for..of` walks CODE POINTS, not UTF-16 units, so an astral character
 * (an emoji in a title) is never split down the middle either.
 */
export function foldLine(line: string): string {
  const chunks: string[] = []
  let current = ""
  let bytes = 0
  // Continuation lines spend one of their 75 octets on the leading space.
  let limit = MAX_OCTETS

  for (const ch of line) {
    const size = UTF8.encode(ch).length
    if (bytes + size > limit) {
      chunks.push(current)
      current = ""
      bytes = 0
      limit = MAX_OCTETS - 1
    }
    current += ch
    bytes += size
  }
  chunks.push(current)

  return chunks.join("\r\n ")
}

/** 'YYYY-MM-DD' → 'YYYYMMDD'. */
export function icalDate(date: string): string {
  return date.replace(/-/g, "")
}

/** 'YYYY-MM-DD' + 'HH:MM' → floating 'YYYYMMDDTHHMMSS' (no zone, no Z — see below). */
export function icalDateTime(date: string, time: string): string {
  return `${icalDate(date)}T${time.replace(":", "")}00`
}

/** An instant → 'YYYYMMDDTHHMMSSZ', for DTSTAMP, which must be UTC. */
export function icalStamp(instant: Date | string): string {
  return new Date(instant).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"
}

/**
 * The RRULE line for a series, or null when it doesn't repeat.
 *
 * Four of the five known mapping gaps are closed here rather than left implicit:
 *
 * - `recurrence_weekdays = 0` means "the anchor's weekday", which RRULE has no implicit
 *   form for, so BYDAY is derived from the anchor and emitted explicitly.
 * - `nth_weekday` stores no ordinal; `nthWeekdayOf` re-derives it, and it is the SAME
 *   function the expander uses, so the feed cannot claim a different Friday to the app.
 * - There is no COUNT column and none is emitted — UNTIL says the same thing.
 * - `recurrence_end_date` is an inclusive DATE. UNTIL is inclusive too, and because
 *   DTSTART is floating the RFC requires UNTIL to be floating as well, so the date maps
 *   straight across with no UTC conversion and no off-by-one to get wrong.
 *
 * BYMONTHDAY and the weekly BYDAY are strictly redundant — RFC defaults both to DTSTART —
 * but stating them makes the feed readable and removes any doubt about what was meant.
 */
export function rruleFor(event: IcalEvent, anchorDate: string): string | null {
  if (event.recurrenceFreq === "none") return null

  const parts = [`FREQ=${event.recurrenceFreq.toUpperCase()}`]

  const interval = Math.max(1, event.recurrenceInterval)
  if (interval > 1) parts.push(`INTERVAL=${interval}`)

  if (event.recurrenceFreq === "weekly") {
    const mask = event.recurrenceWeekdays & 0b1111111
    const days =
      mask === 0
        ? [WEEKDAY_CODES[dowOf(anchorDate)]]
        : WEEKDAY_CODES.filter((_, i) => mask & (1 << i))
    parts.push(`BYDAY=${days.join(",")}`)
  }

  if (event.recurrenceFreq === "monthly") {
    if (event.recurrenceMonthlyMode === "nth_weekday") {
      const { weekday, ordinal, isLast } = nthWeekdayOf(anchorDate)
      // -1 rather than the ordinal when the anchor was the month's last such weekday,
      // matching the expander: a "4th Friday" that was also the last keeps landing on
      // the last Friday in months that have five.
      parts.push(`BYDAY=${isLast ? -1 : ordinal}${WEEKDAY_CODES[weekday]}`)
    } else {
      parts.push(`BYMONTHDAY=${parse(anchorDate)[2]}`)
    }
  }

  // Yearly needs nothing: RFC takes the month and day from DTSTART, and skips years
  // that lack the day (Feb 29) exactly as expandOccurrences does.

  if (event.recurrenceEndDate) {
    parts.push(`UNTIL=${icalDate(event.recurrenceEndDate)}T235959`)
  }

  return `RRULE:${parts.join(";")}`
}

/** DTSTART/DTEND/RECURRENCE-ID lines share this: all-day is a DATE, timed is floating. */
function stamped(
  name: string,
  date: string,
  time: string | null,
  allDay: boolean,
): string {
  return allDay
    ? `${name};VALUE=DATE:${icalDate(date)}`
    : `${name}:${icalDateTime(date, time ?? "00:00")}`
}

/** A local date/time pair for an instant, or null when there isn't one. */
function localOf(instant: Date | string | null, tz: string) {
  return instant ? localDateTime(new Date(instant), tz) : null
}

function textLine(name: string, value: string | null): string[] {
  return value ? [`${name}:${escapeText(value)}`] : []
}

/**
 * Serialize one series into its VEVENT plus any occurrence overrides.
 *
 * Cancellations become EXDATE entries on the series; edits become extra VEVENTs sharing
 * the series UID and carrying RECURRENCE-ID — which is exactly what `event_exceptions`
 * already models, `original_date` being iCalendar's RECURRENCE-ID under another name.
 *
 * EXDATE and RECURRENCE-ID must use the same value TYPE as DTSTART (DATE vs date-time),
 * and RECURRENCE-ID must name where the SERIES would have put the occurrence — never
 * where an override moved it to, or the consumer matches it against nothing.
 */
function vevent(
  event: IcalEvent,
  exceptions: IcalException[],
  tz: string,
): string[] {
  const start = localDateTime(new Date(event.startAt), tz)
  const end = localOf(event.endAt, tz)
  const uid = `${event.id}@winnow`

  const canceled = exceptions.filter((ex) => ex.canceled)
  const overridden = exceptions.filter((ex) => !ex.canceled)

  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icalStamp(event.updatedAt)}`,
    stamped("DTSTART", start.date, start.time, event.allDay),
  ]

  if (end) {
    // All-day DTEND is EXCLUSIVE: a single-day event ends on the following date.
    const endDate = event.allDay ? addDays(end.date, 1) : end.date
    lines.push(stamped("DTEND", endDate, end.time, event.allDay))
  }

  lines.push(...textLine("SUMMARY", event.title))
  lines.push(...textLine("DESCRIPTION", event.notes))

  const rrule = rruleFor(event, start.date)
  if (rrule) lines.push(rrule)

  if (canceled.length > 0) {
    // One line, comma-separated — folding handles the length.
    const values = canceled
      .map((ex) =>
        event.allDay
          ? icalDate(ex.originalDate)
          : icalDateTime(ex.originalDate, start.time ?? "00:00"),
      )
      .join(",")
    lines.push(
      event.allDay ? `EXDATE;VALUE=DATE:${values}` : `EXDATE:${values}`,
    )
  }

  lines.push("END:VEVENT")

  for (const ex of overridden) {
    const allDay = ex.allDay ?? event.allDay
    const exStart = localOf(ex.startAt, tz) ?? {
      date: ex.originalDate,
      time: start.time ?? "00:00",
    }
    const exEnd = localOf(ex.endAt, tz)

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${icalStamp(ex.updatedAt)}`,
      // Keyed on the ORIGINAL date, in the SERIES' value type and anchor time.
      stamped("RECURRENCE-ID", ex.originalDate, start.time, event.allDay),
      stamped("DTSTART", exStart.date, exStart.time, allDay),
    )
    if (exEnd) {
      const endDate = allDay ? addDays(exEnd.date, 1) : exEnd.date
      lines.push(stamped("DTEND", endDate, exEnd.time, allDay))
    }
    lines.push(...textLine("SUMMARY", ex.title ?? event.title))
    lines.push(...textLine("DESCRIPTION", ex.notes ?? event.notes))
    lines.push("END:VEVENT")
  }

  return lines
}

/**
 * The whole document.
 *
 * **Times are emitted as FLOATING local time** — no `Z`, no `TZID`, no VTIMEZONE. That is
 * the faithful serialization of this app rather than a shortcut: the calendar is wall-clock
 * by design (a 09:00 standup stays 09:00 across a DST boundary) and every view renders in
 * `user_preferences.timeZone`, never in the viewing device's zone. Floating time never
 * converts either, so a subscribed device shows the same 09:00 the app does. A TZID would
 * make the feed disagree with the app it came from, and would drag in a hand-generated
 * VTIMEZONE for an arbitrary IANA zone.
 *
 * The cost, stated: a consumer in another timezone sees wall-clock rather than a converted
 * time. For a single-user personal calendar that is the intent — see ADR-0008 for the
 * trigger to revisit.
 */
export function toVCalendar(
  events: IcalEvent[],
  exceptions: IcalException[],
  tz: string,
  calendarName = "Winnow",
): string {
  const byEvent = new Map<string, IcalException[]>()
  for (const ex of exceptions) {
    const list = byEvent.get(ex.eventId)
    if (list) list.push(ex)
    else byEvent.set(ex.eventId, [ex])
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Winnow//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // Non-standard, but universally honoured — without it a subscription shows up
    // on the phone as "Untitled".
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    ...events.flatMap((e) => vevent(e, byEvent.get(e.id) ?? [], tz)),
    "END:VCALENDAR",
  ]

  // CRLF is required, including a trailing one.
  return lines.map(foldLine).join("\r\n") + "\r\n"
}
