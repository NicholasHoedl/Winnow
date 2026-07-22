// Pure calendar/recurrence logic. No DB — unit-testable directly. Occurrences use a
// wall-clock model (local date + a constant time-of-day derived once from the anchor)
// so recurrence stepping is plain calendar-date arithmetic with no timezone/DST
// reconstruction. Recurring instances are computed here on read, never materialized.

import { todayInZone } from "@/modules/todos/service"

export type RecurrenceFreq = "none" | "daily" | "weekly" | "monthly" | "yearly"

// Minimal shape the engine needs, decoupled from the Drizzle row so it stays
// DB-free and testable with plain objects. The full event row satisfies it.
export type RecurringEvent = {
  startAt: Date | string
  endAt: Date | string | null
  allDay: boolean
  recurrenceFreq: RecurrenceFreq
  recurrenceInterval: number
  recurrenceEndDate: string | null
}

export type Occurrence<E extends RecurringEvent = RecurringEvent> = {
  event: E
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
    for (let guard = 0; guard < CAP; guard++, i++) {
      const idx = anchorIndex + i * interval
      const y = Math.floor(idx / 12)
      const m = (idx % 12) + 1
      if (fmt(y, m, 1) >= hardEnd) break
      // Skip months without the anchor day (e.g. the 31st in February).
      if (daysInMonth(y, m) >= anchorDay) emit(fmt(y, m, anchorDay))
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

// --- month grid + day bucketing ---

/** A Sunday-started rectangular grid (weeks × 7 YYYY-MM-DD) covering `month`
 *  ('YYYY-MM'), padded with adjacent-month days. */
export function monthGrid(month: string): string[][] {
  const [y, m] = parse(month)
  const first = fmt(y, m, 1)
  const firstDow = new Date(`${first}T00:00:00Z`).getUTCDay() // 0 = Sunday
  const last = fmt(y, m, daysInMonth(y, m))

  let cursor = addDays(first, -firstDow)
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
export function gridRange(month: string): {
  grid: string[][]
  start: string
  end: string
} {
  const grid = monthGrid(month)
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
