// Pure calendar/recurrence logic. No DB — unit-testable directly. Occurrences use a
// wall-clock model (local date + a constant time-of-day derived once from the anchor)
// so recurrence stepping is plain calendar-date arithmetic with no timezone/DST
// reconstruction. Recurring instances are computed here on read, never materialized.

import {
  addDays,
  dayDiff,
  daysInMonth,
  dowOf,
  fmt,
  parse,
  todayInZone,
} from "@/lib/date"

export type RecurrenceFreq = "none" | "daily" | "weekly" | "monthly" | "yearly"

// Minimal shape the engine needs, decoupled from the Drizzle row so it stays
// DB-free and testable with plain objects. The full event row satisfies it.
export type RecurrenceMonthlyMode = "day_of_month" | "nth_weekday"

export type RecurringEvent = {
  startAt: Date | string
  endAt: Date | string | null
  allDay: boolean
  recurrenceFreq: RecurrenceFreq
  recurrenceInterval: number
  // Weekly BYDAY as a 7-bit mask (bit i = weekday i, 0=Sun). 0 = anchor weekday only.
  recurrenceWeekdays: number
  recurrenceMonthlyMode: RecurrenceMonthlyMode
  recurrenceEndDate: string | null
}

export type Occurrence<E extends RecurringEvent = RecurringEvent> = {
  event: E // effective event (series row, with any per-occurrence override applied)
  seriesEvent: E // the underlying series row (== event unless overridden)
  date: string // YYYY-MM-DD local start date
  endDate: string // YYYY-MM-DD local end date (== date unless multi-day)
  time: string | null // HH:MM local start, null when all-day
  endTime: string | null
  /**
   * The date the SERIES would produce this on, which is what any per-occurrence
   * override is keyed under. Equal to `date` until something moves the occurrence.
   *
   * Carried separately because `date` stops being the key the moment a move is
   * possible: rescheduling a moved occurrence again has to update the row it already
   * has, and addressing that row by where the block currently sits would write a
   * second one instead — leaving the series with two overrides fighting over it.
   */
  originalDate: string
}

/** An occurrence's stable identity — iCalendar's RECURRENCE-ID. Occurrences carry no
 *  id of their own, and `bucketByDay` puts the SAME object into every day a span
 *  covers, so neither object identity nor a list index can tell two of them apart. */
export function occurrenceKey(occ: {
  seriesEvent: { id: string }
  originalDate: string
}): string {
  return `${occ.seriesEvent.id}::${occ.originalDate}`
}

function minStr(a: string, b: string): string {
  return a < b ? a : b
}

// --- local wall-clock ---

export function localDateTime(
  instant: Date,
  tz: string,
): { date: string; time: string } {
  const date = todayInZone(instant, tz)
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant)
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00"
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00"
  // Some engines emit "24" for midnight under hour12:false.
  return { date, time: `${hour === "24" ? "00" : hour}:${minute}` }
}

/** Offset (ms) of `tz` at `date`: local-wall-clock-as-UTC minus the actual instant. */
function tzOffsetMs(tz: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  const hour = map.hour === "24" ? 0 : Number(map.hour)
  const asIfUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  )
  return asIfUtc - date.getTime()
}

/** Interpret a local wall-clock (`YYYY-MM-DD` + `HH:MM`) in `tz` as a UTC instant —
 *  the inverse of localDateTime. DST-safe via a one-pass offset correction. */
export function zonedDateTimeToUtc(
  date: string,
  time: string,
  tz: string,
): Date {
  const [y, mo, d] = date.split("-").map(Number)
  const [h, mi] = (time || "00:00").split(":").map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  const off1 = tzOffsetMs(tz, new Date(asUtc))
  let instant = asUtc - off1
  const off2 = tzOffsetMs(tz, new Date(instant))
  if (off2 !== off1) instant = asUtc - off2
  return new Date(instant)
}

/**
 * How far an occurrence may be rescheduled from the day its series would produce it.
 *
 * A bound rather than a preference. An occurrence is found again by its ORIGINAL date,
 * so a view has to scan far enough either side of itself to catch anything that moved
 * in — and "far enough" is only knowable if moves are bounded. Unbounded, every read
 * would have to consider every exception ever written. Two months is far past anything
 * a single occurrence of a repeating event has business being moved to; beyond that,
 * editing the series is the honest answer.
 */
export const MAX_MOVE_DAYS = 60

// --- recurrence expansion ---

const CAP = 1000

/**
 * Read a monthly `nth_weekday` rule off its anchor date: which weekday, which
 * occurrence of it in the month, and whether that is also the month's LAST one.
 *
 * None of this is stored — `recurrence_monthly_mode` records only that the rule IS
 * nth-weekday, so every reader has to re-derive the rest from the anchor. That was
 * survivable while `expandOccurrences` was the only reader. It isn't now: the iCal
 * writer has to emit the same rule as `BYDAY=3MO` / `BYDAY=-1FR`, and two independent
 * derivations that disagree would publish a feed saying "last Friday" for a series the
 * app draws on the 4th. One function, two callers, no room to drift.
 *
 * `isLast` wins over `ordinal` where both apply, which is why it is a separate flag: a
 * 4th Friday that is also the last should keep landing on the last Friday in months
 * that have five. `splitSeriesAt` already calls that ambiguity out as living "in the
 * schema, not in the split" — this is the same wart, just now shared deliberately.
 */
export function nthWeekdayOf(anchor: string): {
  /** 0 = Sunday, matching `dowOf` / `getUTCDay`. */
  weekday: number
  /** 1-based: the 1st..5th such weekday of the month. */
  ordinal: number
  isLast: boolean
} {
  const [year, month, day] = parse(anchor)
  return {
    weekday: dowOf(anchor),
    ordinal: Math.ceil(day / 7),
    isLast: day + 7 > daysInMonth(year, month),
  }
}

/** Expand an event into its occurrences overlapping [rangeStart, rangeEnd) (both
 *  YYYY-MM-DD) — a multi-day occurrence counts when any of its span lands in the
 *  range, so its `date` may precede rangeStart. Series end is inclusive. */
export function expandOccurrences<E extends RecurringEvent>(
  event: E,
  rangeStart: string,
  rangeEnd: string,
  tz: string,
): Occurrence<E>[] {
  const start = localDateTime(new Date(event.startAt), tz)
  const anchor = start.date
  const time = event.allDay ? null : start.time

  let endOffset = 0
  let endTime: string | null = null
  if (event.endAt) {
    const end = localDateTime(new Date(event.endAt), tz)
    endOffset = Math.max(0, dayDiff(anchor, end.date))
    endTime = event.allDay ? null : end.time
  }

  const make = (date: string): Occurrence<E> => ({
    event,
    seriesEvent: event,
    date,
    originalDate: date, // nothing has moved it yet
    endDate: endOffset > 0 ? addDays(date, endOffset) : date,
    time,
    endTime,
  })

  if (event.recurrenceFreq === "none") {
    const occ = make(anchor)
    return occ.endDate >= rangeStart && occ.date < rangeEnd ? [occ] : []
  }

  // Exclusive hard end = min(view end, day after the inclusive series end).
  const hardEnd = event.recurrenceEndDate
    ? minStr(rangeEnd, addDays(event.recurrenceEndDate, 1))
    : rangeEnd
  if (anchor >= hardEnd) return []

  const interval = Math.max(1, event.recurrenceInterval)
  const out: Occurrence<E>[] = []

  // An occurrence is in view when its SPAN overlaps the range — the same test the
  // one-off path above uses (endDate >= rangeStart && date < rangeEnd). Since every
  // occurrence spans `endOffset` days, that is exactly "starts on or after
  // rangeStart - endOffset", so shifting the start is equivalent to comparing
  // endDate and keeps each frequency's seek-ahead arithmetic intact. Without it a
  // recurring Mon–Wed event is invisible in a week beginning Tuesday while an
  // identical one-off is not.
  const seekStart = endOffset > 0 ? addDays(rangeStart, -endOffset) : rangeStart

  const emit = (date: string) => {
    if (date >= seekStart && date < hardEnd) out.push(make(date))
  }

  // Weekly with a selected weekday set (BYDAY): emit each chosen weekday within
  // every active `interval`-week block, counting blocks from the anchor's week.
  if (
    event.recurrenceFreq === "weekly" &&
    (event.recurrenceWeekdays & 0b1111111) !== 0
  ) {
    const mask = event.recurrenceWeekdays & 0b1111111
    const anchorWeekStart = addDays(anchor, -dowOf(anchor))
    const rsWeekStart = addDays(seekStart, -dowOf(seekStart))
    const weeksToRs = dayDiff(anchorWeekStart, rsWeekStart) / 7
    let block = weeksToRs > 0 ? Math.floor(weeksToRs / interval) : 0
    for (let guard = 0; guard < CAP; guard++, block++) {
      const blockStart = addDays(anchorWeekStart, block * interval * 7)
      if (blockStart >= hardEnd) break
      for (let wd = 0; wd < 7; wd++) {
        if (!(mask & (1 << wd))) continue
        const date = addDays(blockStart, wd)
        if (date >= anchor) emit(date) // never before the series start
      }
    }
    return out
  }

  if (event.recurrenceFreq === "daily" || event.recurrenceFreq === "weekly") {
    const step = interval * (event.recurrenceFreq === "weekly" ? 7 : 1)
    // Jump straight to the first occurrence >= seekStart.
    const k =
      anchor < seekStart ? Math.ceil(dayDiff(anchor, seekStart) / step) : 0
    let date = addDays(anchor, k * step)
    for (let i = 0; i < CAP && date < hardEnd; i++) {
      emit(date)
      date = addDays(date, step)
    }
    return out
  }

  const [anchorYear, anchorMonth, anchorDay] = parse(anchor)

  if (event.recurrenceFreq === "monthly") {
    const anchorIndex = anchorYear * 12 + (anchorMonth - 1)
    const [rsY, rsM] = parse(seekStart)
    const rangeIndex = rsY * 12 + (rsM - 1)
    let i =
      anchorIndex < rangeIndex
        ? Math.floor((rangeIndex - anchorIndex) / interval)
        : 0

    // "Nth weekday" mode derives its target from the anchor. Shared with the iCal
    // writer so the two can't disagree about which Friday a series means.
    const nthWeekday = event.recurrenceMonthlyMode === "nth_weekday"
    const { weekday: anchorDow, ordinal, isLast } = nthWeekdayOf(anchor)

    for (let guard = 0; guard < CAP; guard++, i++) {
      const idx = anchorIndex + i * interval
      const y = Math.floor(idx / 12)
      const m = (idx % 12) + 1
      if (fmt(y, m, 1) >= hardEnd) break
      if (nthWeekday) {
        const firstDow = dowOf(fmt(y, m, 1))
        const firstOccDay = 1 + ((anchorDow - firstDow + 7) % 7) // 1..7
        const dim = daysInMonth(y, m)
        const day = isLast
          ? firstOccDay + 7 * Math.floor((dim - firstOccDay) / 7) // last such weekday
          : firstOccDay + 7 * (ordinal - 1)
        // Skip a nonexistent occurrence (e.g. a 5th that the month lacks).
        if (day <= dim) emit(fmt(y, m, day))
      } else if (daysInMonth(y, m) >= anchorDay) {
        // Same day-of-month; skip months without it (e.g. the 31st in February).
        emit(fmt(y, m, anchorDay))
      }
    }
    return out
  }

  // yearly — skip years without the anchor day (e.g. Feb 29 in non-leap years).
  const [rsY] = parse(seekStart)
  let y =
    anchorYear < rsY
      ? anchorYear + Math.floor((rsY - anchorYear) / interval) * interval
      : anchorYear
  for (let guard = 0; guard < CAP; guard++, y += interval) {
    if (fmt(y, 1, 1) >= hardEnd) break
    if (daysInMonth(y, anchorMonth) >= anchorDay)
      emit(fmt(y, anchorMonth, anchorDay))
  }
  return out
}

// --- per-occurrence exceptions (read-time overlay) ---

// A per-occurrence override or skip. The DB row (`event_exceptions`) satisfies this
// structurally; null override fields inherit from the series.
export type ExceptionOverlay = {
  eventId: string
  originalDate: string // the occurrence's natural date — matches Occurrence.date
  canceled: boolean
  startAt: Date | string | null
  endAt: Date | string | null
  allDay: boolean | null
  title: string | null
  notes: string | null
  calendarId: string | null
}

// The event fields the overlay reads/replaces beyond the recurrence shape. EventRow has them.
type OverlayableEvent = RecurringEvent & {
  id: string
  title: string
  notes: string | null
  calendarId: string | null
}

/**
 * Where an override actually puts its occurrence, or null when it leaves it alone.
 *
 * An override always carries a full instant, so the day it lands on is already stored
 * and needs no column of its own — which also means the day and the time can never
 * disagree about the same occurrence. A row with no `startAt` inherits the series
 * anchor's instant, whose date is the ANCHOR's, not this occurrence's; that is not a
 * move, so it reads as null rather than as a jump to the anchor's day.
 */
export function overrideDate(ex: ExceptionOverlay, tz: string): string | null {
  return ex.startAt ? localDateTime(new Date(ex.startAt), tz).date : null
}

/** Apply per-occurrence exceptions to expanded occurrences (pure, order-preserving):
 *  - canceled → the occurrence is dropped ("skip this day");
 *  - override → `event` becomes the effective event (series + defined overrides) and
 *    date/time/endTime/endDate are recomputed from the override instants;
 *    the untouched series stays on `seriesEvent`;
 *  - no match → passed through unchanged.
 *  Keyed on (eventId, originalDate) = the occurrence's RECURRENCE-ID.
 *
 *  `range` is the half-open view the result has to fit. An override can move its
 *  occurrence to another day, so one expanded INSIDE the view can land outside it and
 *  has to be dropped here — `expandOccurrences` filtered on the natural date and cannot
 *  know. The mirror case (moved in from outside) is the caller's, since the occurrence
 *  it would apply to was never expanded. Omit `range` to skip the check. */
export function applyExceptions<E extends OverlayableEvent>(
  occurrences: Occurrence<E>[],
  exceptions: ExceptionOverlay[],
  tz: string,
  range?: { start: string; end: string },
): Occurrence<E>[] {
  if (exceptions.length === 0) return occurrences
  const byKey = new Map<string, ExceptionOverlay>()
  for (const ex of exceptions)
    byKey.set(`${ex.eventId}::${ex.originalDate}`, ex)

  const out: Occurrence<E>[] = []
  for (const occ of occurrences) {
    const ex = byKey.get(occurrenceKey(occ))
    if (!ex) {
      out.push(occ)
      continue
    }
    if (ex.canceled) continue

    const series = occ.seriesEvent
    const startAt = ex.startAt ?? series.startAt
    const endAt = ex.endAt ?? series.endAt
    const allDay = ex.allDay ?? series.allDay
    const effective = {
      ...series,
      startAt,
      endAt,
      allDay,
      title: ex.title ?? series.title,
      notes: ex.notes ?? series.notes,
      calendarId: ex.calendarId ?? series.calendarId,
    } as E
    // Derive the local time-of-day and multi-day span from the effective instants.
    // endAt may be inherited from the series anchor (a different calendar day), so use
    // only its offset in days — never its absolute date, which would push endDate onto
    // the anchor's day.
    const start = localDateTime(new Date(startAt), tz)
    let endOffset = 0
    let endTime: string | null = null
    if (endAt) {
      const end = localDateTime(new Date(endAt), tz)
      endOffset = Math.max(0, dayDiff(start.date, end.date))
      endTime = allDay ? null : end.time
    }
    // An override that sets its own instant also sets its own day; one that inherits
    // the series' stays where the series put it.
    const date = overrideDate(ex, tz) ?? occ.date
    if (range && (date < range.start || date >= range.end)) continue
    out.push({
      event: effective,
      seriesEvent: series,
      date,
      originalDate: occ.originalDate, // the key the override is stored under
      endDate: endOffset > 0 ? addDays(date, endOffset) : date,
      time: allDay ? null : start.time,
      endTime,
    })
  }
  return out
}

/**
 * Split a recurring event in two at `fromDate` — the "this and following" edit.
 *
 * `head` is the original stopped the day BEFORE the split, since `recurrenceEndDate` is
 * inclusive. `tail` is the continuation re-anchored ON the split date, carrying whatever
 * the edit changed.
 *
 * Re-anchoring is what preserves phase. An every-other-week series counted from its
 * original anchor and one counted from the split date land on the same days only because
 * the split date is itself an occurrence — which it always is, since it comes from one.
 * The same holds for every-third-month and for a weekly BYDAY set.
 *
 * Pure, and returns the two shapes rather than writing anything, so the boundary can be
 * checked by expanding both and comparing against the original. Off by one either way
 * and the series quietly gains a duplicate day or loses one.
 *
 * One inherited caveat: `nth_weekday` does not store its ordinal and re-derives it from
 * whichever month the anchor lands in, so splitting a "4th Friday" series at a month
 * whose 4th Friday is also its last can turn it into a "last Friday" one. That
 * ambiguity is in the schema, not in the split — but the split is where it shows up.
 */
export function splitSeriesAt<E extends RecurringEvent>(
  event: E,
  fromDate: string,
  tailFields: Partial<E>,
): { head: E; tail: E } {
  return {
    head: { ...event, recurrenceEndDate: addDays(fromDate, -1) },
    tail: { ...event, ...tailFields },
  }
}

/**
 * The natural dates a view has to expand ON TOP of its own range, because an override
 * moved their occurrence into it from outside.
 *
 * This is the half `applyExceptions` cannot do. Dropping an occurrence that moved OUT
 * is easy — it was expanded, so there is something to drop. One that moved IN was never
 * expanded at all: `expandOccurrences` filters on the natural date, and the natural date
 * is outside the view. Without this the occurrence simply isn't there, and the bug looks
 * like data loss rather than a missing query.
 *
 * Returns one entry per affected occurrence, so the caller expands exactly those days
 * and nothing more.
 */
export function inboundOccurrenceDates(
  exceptions: ExceptionOverlay[],
  range: { start: string; end: string },
  tz: string,
): { eventId: string; date: string }[] {
  const out: { eventId: string; date: string }[] = []
  for (const ex of exceptions) {
    if (ex.canceled) continue
    const moved = overrideDate(ex, tz)
    if (!moved || moved < range.start || moved >= range.end) continue
    // Already inside the view — it was expanded normally.
    if (ex.originalDate >= range.start && ex.originalDate < range.end) continue
    out.push({ eventId: ex.eventId, date: ex.originalDate })
  }
  return out
}

// --- month grid + day bucketing ---

/** A rectangular grid (weeks × 7 YYYY-MM-DD) covering `month` ('YYYY-MM'),
 *  padded with adjacent-month days. `weekStartsOn`: 0 = Sunday, 1 = Monday. */
export function monthGrid(month: string, weekStartsOn = 0): string[][] {
  const [y, m] = parse(month)
  const first = fmt(y, m, 1)
  const firstDow = new Date(`${first}T00:00:00Z`).getUTCDay() // 0 = Sunday
  const last = fmt(y, m, daysInMonth(y, m))

  // Days to back up so the first row begins on `weekStartsOn`.
  const lead = (firstDow - weekStartsOn + 7) % 7
  let cursor = addDays(first, -lead)
  const weeks: string[][] = []
  do {
    const week: string[] = []
    for (let i = 0; i < 7; i++) {
      week.push(cursor)
      cursor = addDays(cursor, 1)
    }
    weeks.push(week)
  } while (weeks[weeks.length - 1][6] < last)
  return weeks
}

/** The seven dates of the week containing `date`, starting on `weekStartsOn`
 *  (0 = Sunday, 1 = Monday). A week routinely straddles two months, which is why the
 *  week view cannot be served from `gridRange`. */
export function weekDates(date: string, weekStartsOn = 0): string[] {
  const start = addDays(date, -((dowOf(date) - weekStartsOn + 7) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** The visible month grid plus its half-open date range [start, end). */
export function gridRange(
  month: string,
  weekStartsOn = 0,
): {
  grid: string[][]
  start: string
  end: string
} {
  const grid = monthGrid(month, weekStartsOn)
  return {
    grid,
    start: grid[0][0],
    end: addDays(grid[grid.length - 1][6], 1),
  }
}

/** Group occurrences by local day, spreading multi-day spans across each day. */
export function bucketByDay<E extends RecurringEvent>(
  occurrences: Occurrence<E>[],
): Record<string, Occurrence<E>[]> {
  const out: Record<string, Occurrence<E>[]> = {}
  for (const occ of occurrences) {
    let d = occ.date
    while (d <= occ.endDate) {
      ;(out[d] ??= []).push(occ)
      d = addDays(d, 1)
    }
  }
  return out
}
