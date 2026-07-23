// Pure calendar/recurrence logic. No DB — unit-testable directly. Occurrences use a
// wall-clock model (local date + a constant time-of-day derived once from the anchor)
// so recurrence stepping is plain calendar-date arithmetic with no timezone/DST
// reconstruction. Recurring instances are computed here on read, never materialized.

import { todayInZone } from "@/modules/todos/service"

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
}

// --- date-string helpers (YYYY-MM-DD) ---

function parse(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split("-").map(Number)
  return [y, m, d]
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** Days in month m (1-12) of year y. */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = parse(dateStr)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** b - a in whole days. */
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = parse(a)
  const [by, bm, bd] = parse(b)
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  )
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
export function zonedDateTimeToUtc(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split("-").map(Number)
  const [h, mi] = (time || "00:00").split(":").map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  const off1 = tzOffsetMs(tz, new Date(asUtc))
  let instant = asUtc - off1
  const off2 = tzOffsetMs(tz, new Date(instant))
  if (off2 !== off1) instant = asUtc - off2
  return new Date(instant)
}

// --- recurrence expansion ---

const CAP = 1000

/** Expand an event into its occurrences whose start date falls in
 *  [rangeStart, rangeEnd) (both YYYY-MM-DD). Series end is inclusive. */
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
  const emit = (date: string) => {
    if (date >= rangeStart && date < hardEnd) out.push(make(date))
  }

  const dowOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() // 0 = Sun

  // Weekly with a selected weekday set (BYDAY): emit each chosen weekday within
  // every active `interval`-week block, counting blocks from the anchor's week.
  if (
    event.recurrenceFreq === "weekly" &&
    (event.recurrenceWeekdays & 0b1111111) !== 0
  ) {
    const mask = event.recurrenceWeekdays & 0b1111111
    const anchorWeekStart = addDays(anchor, -dowOf(anchor))
    const rsWeekStart = addDays(rangeStart, -dowOf(rangeStart))
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
    // Jump straight to the first occurrence >= rangeStart.
    const k = anchor < rangeStart ? Math.ceil(dayDiff(anchor, rangeStart) / step) : 0
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
    const [rsY, rsM] = parse(rangeStart)
    const rangeIndex = rsY * 12 + (rsM - 1)
    let i =
      anchorIndex < rangeIndex
        ? Math.floor((rangeIndex - anchorIndex) / interval)
        : 0

    // "Nth weekday" mode derives its target from the anchor: the weekday, which
    // occurrence in the month (1-based), and whether that was the *last* one.
    const nthWeekday = event.recurrenceMonthlyMode === "nth_weekday"
    const anchorDow = dowOf(anchor)
    const ordinal = Math.ceil(anchorDay / 7)
    const isLast = anchorDay + 7 > daysInMonth(anchorYear, anchorMonth)

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
  const [rsY] = parse(rangeStart)
  let y =
    anchorYear < rsY
      ? anchorYear + Math.floor((rsY - anchorYear) / interval) * interval
      : anchorYear
  for (let guard = 0; guard < CAP; guard++, y += interval) {
    if (fmt(y, 1, 1) >= hardEnd) break
    if (daysInMonth(y, anchorMonth) >= anchorDay) emit(fmt(y, anchorMonth, anchorDay))
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

/** Apply per-occurrence exceptions to expanded occurrences (pure, order-preserving):
 *  - canceled → the occurrence is dropped ("skip this day");
 *  - override → `event` becomes the effective event (series + defined overrides) and
 *    time/endTime/endDate are recomputed from the override instants; the untouched
 *    series stays on `seriesEvent`. v1 locks the occurrence to its original date;
 *  - no match → passed through unchanged.
 *  Keyed on (eventId, originalDate) = the occurrence's RECURRENCE-ID. */
export function applyExceptions<E extends OverlayableEvent>(
  occurrences: Occurrence<E>[],
  exceptions: ExceptionOverlay[],
  tz: string,
): Occurrence<E>[] {
  if (exceptions.length === 0) return occurrences
  const byKey = new Map<string, ExceptionOverlay>()
  for (const ex of exceptions) byKey.set(`${ex.eventId}::${ex.originalDate}`, ex)

  const out: Occurrence<E>[] = []
  for (const occ of occurrences) {
    const ex = byKey.get(`${occ.seriesEvent.id}::${occ.date}`)
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
    // Derive the local time-of-day and multi-day span from the effective instants,
    // but keep the occurrence anchored on occ.date. endAt may be inherited from the
    // series anchor (a different calendar day), so use only its offset in days — never
    // its absolute date, which would push endDate onto the anchor's day.
    const start = localDateTime(new Date(startAt), tz)
    let endOffset = 0
    let endTime: string | null = null
    if (endAt) {
      const end = localDateTime(new Date(endAt), tz)
      endOffset = Math.max(0, dayDiff(start.date, end.date))
      endTime = allDay ? null : end.time
    }
    out.push({
      event: effective,
      seriesEvent: series,
      date: occ.date, // locked to the original occurrence date in v1
      endDate: endOffset > 0 ? addDays(occ.date, endOffset) : occ.date,
      time: allDay ? null : start.time,
      endTime,
    })
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

// --- goals ---

export function goalProgress(
  milestones: { done: boolean }[],
): { done: number; total: number; percent: number } {
  const total = milestones.length
  const done = milestones.filter((mile) => mile.done).length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { done, total, percent }
}
