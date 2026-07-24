// Tiny, dependency-free natural-language date parser for quick-add. Extracts a due
// date from free text and returns the leftover text with the date phrase removed, so
// "call mom tomorrow" → { date: <tomorrow>, cleaned: "call mom" }. Deliberately narrow
// and forward-leaning (a due-date parser); anything it doesn't recognise leaves
// date=null and the text untouched. Pure — unit-tested directly. See [[nl-date-test]].

import { addDays, dowOf, fmt, isValidDateString } from "@/lib/date"

// Longer spellings first so the alternation prefers "sunday" over "sun" (the \b guards
// also handle this, but ordering keeps it obvious).
const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  weds: 3,
  tues: 2,
  thurs: 4,
  thur: 4,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const WEEKDAY_ALT = Object.keys(WEEKDAYS).join("|")
const MONTH_ALT = Object.keys(MONTHS).join("|")

// The coming date with weekday `target`. skipToday=false → today counts when it
// matches (0..6 days ahead); skipToday=true → always in the future (1..7 ahead), so
// "next friday" lands a week out only when today is already that weekday.
function comingWeekday(today: string, target: number, skipToday: boolean): string {
  let delta = (target - dowOf(today) + 7) % 7
  if (delta === 0 && skipToday) delta = 7
  return addDays(today, delta)
}

// A month/day pair → YYYY-MM-DD in `today`'s year, rolled to next year if already
// past. Returns null for impossible dates (e.g. Feb 30) so callers can ignore them.
function monthDay(today: string, month: number, day: number): string | null {
  const year = Number(today.slice(0, 4))
  const thisYear = fmt(year, month, day)
  if (!isValidDateString(thisYear)) return null
  return thisYear >= today ? thisYear : fmt(year + 1, month, day)
}

type Match = { date: string; start: number; end: number }

// Each matcher runs against the lowercased text and returns the resolved date plus the
// span to cut. Ordered most-specific first so "day after tomorrow" beats "tomorrow".
function findDate(lower: string, today: string): Match | null {
  const matchers: Array<() => Match | null> = [
    // Explicit ISO date.
    () => {
      const m = /\b(\d{4}-\d{2}-\d{2})\b/.exec(lower)
      return m && isValidDateString(m[1])
        ? { date: m[1], start: m.index, end: m.index + m[0].length }
        : null
    },
    () => rel(/\bday after tomorrow\b/, 2),
    () => rel(/\b(?:today|tonight)\b/, 0),
    () => rel(/\b(?:tomorrow|tmrw|tmr|tomorow)\b/, 1),
    () => rel(/\byesterday\b/, -1),
    () => rel(/\bnext week\b/, 7),
    // "in 3 days" / "in 2 weeks".
    () => {
      const m = /\bin (\d{1,3}) (day|days|week|weeks)\b/.exec(lower)
      if (!m) return null
      const n = Number(m[1])
      const days = m[2].startsWith("week") ? n * 7 : n
      return { date: addDays(today, days), start: m.index, end: m.index + m[0].length }
    },
    // "next friday" → the following-week occurrence.
    () => weekday(new RegExp(`\\bnext (${WEEKDAY_ALT})\\b`), true),
    // "this/on/by/due friday" and bare "friday" → the coming occurrence (today counts).
    () =>
      weekday(new RegExp(`\\b(?:this|on|by|due(?: on)?) (${WEEKDAY_ALT})\\b`), false),
    () => weekday(new RegExp(`\\b(${WEEKDAY_ALT})\\b`), false),
    // "aug 5", "august 5th", "5 aug", "5th of august".
    () => {
      const a = new RegExp(
        `\\b(${MONTH_ALT})\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b`,
      ).exec(lower)
      if (a) {
        const date = monthDay(today, MONTHS[a[1]], Number(a[2]))
        if (date) return { date, start: a.index, end: a.index + a[0].length }
      }
      const b = new RegExp(
        `\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${MONTH_ALT})\\b`,
      ).exec(lower)
      if (b) {
        const date = monthDay(today, MONTHS[b[2]], Number(b[1]))
        if (date) return { date, start: b.index, end: b.index + b[0].length }
      }
      return null
    },
    // Numeric M/D or M/D/YY(YY).
    () => {
      const m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(lower)
      if (!m) return null
      const month = Number(m[1])
      const day = Number(m[2])
      let date: string | null
      if (m[3]) {
        const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
        date = fmt(year, month, day)
        if (!isValidDateString(date)) date = null
      } else {
        date = monthDay(today, month, day)
      }
      return date ? { date, start: m.index, end: m.index + m[0].length } : null
    },
  ]

  function rel(re: RegExp, days: number): Match | null {
    const m = re.exec(lower)
    return m
      ? { date: addDays(today, days), start: m.index, end: m.index + m[0].length }
      : null
  }
  function weekday(re: RegExp, skipToday: boolean): Match | null {
    const m = re.exec(lower)
    if (!m) return null
    const dow = WEEKDAYS[m[1]]
    return {
      date: comingWeekday(today, dow, skipToday),
      start: m.index,
      end: m.index + m[0].length,
    }
  }

  for (const run of matchers) {
    const hit = run()
    if (hit) return hit
  }
  return null
}

export type ParsedDate = { date: string | null; cleaned: string }

/**
 * Pull a due date out of `text`, returning the date (YYYY-MM-DD) and the text with the
 * date phrase — plus a dangling leading "on/by/due" — removed. `today` is the wall-date
 * to resolve relative phrases against (pass `todayInZone(new Date(), tz)`).
 */
export function parseNaturalDate(text: string, today: string): ParsedDate {
  const lower = text.toLowerCase()
  const hit = findDate(lower, today)
  if (!hit) return { date: null, cleaned: text.trim() }

  // Swallow a preposition immediately before the date phrase ("call mom on friday").
  let start = hit.start
  const before = text.slice(0, start)
  const prep = /\b(on|by|due(?: on)?)\s+$/i.exec(before)
  if (prep) start = prep.index

  const cleaned = (text.slice(0, start) + text.slice(hit.end))
    .replace(/\s{2,}/g, " ")
    .trim()
  return { date: hit.date, cleaned }
}
