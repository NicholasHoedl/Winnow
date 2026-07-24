// Pure recurring-task scheduling. No DB — unit-testable with plain strings. Given a rule
// and the local "today" (already resolved from a timezone by the caller), it returns the
// single CURRENT cycle to materialize, or null when there is none right now. Date math is
// on 'YYYY-MM-DD' strings (DST-immune), mirroring the calendar recurrence engine but
// searching backward for the latest occurrence ≤ today instead of forward-emitting a range.

import { addDays, dayDiff, daysInMonth, dowOf, fmt, parse } from "@/lib/date"

export type TaskRecurrenceFreq = "daily" | "weekly" | "monthly"
export type TaskRecurrenceMonthlyMode = "day_of_month" | "nth_weekday"

// Minimal shape the scheduler needs; the Drizzle row satisfies it structurally.
export type TaskRecurrenceRule = {
  freq: TaskRecurrenceFreq
  recurrenceInterval: number
  // Weekly BYDAY as a 7-bit mask (bit i = weekday i, 0=Sun). 0 = anchor weekday only.
  weekdays: number
  monthlyMode: TaskRecurrenceMonthlyMode
  // "Once per period, any day within it" — only meaningful for weekly/monthly.
  flexible: boolean
  startDate: string // YYYY-MM-DD anchor
  endDate: string | null // inclusive; open-ended if null
}

// The instance to keep for a rule right now: `occurrenceDate` is the stable cycle key,
// `dueDate` is what the task shows (== occurrenceDate for specific days; the period end
// for flexible weekly/monthly).
export type Cycle = { occurrenceDate: string; dueDate: string }

const GUARD = 480 // ~40 years of monthly steps; a safety bound on backward scans

// --- per-frequency "latest occurrence ≤ today" (specific-day modes) ---

/** Latest daily occurrence ≤ today (interval days from the anchor). Assumes today ≥ start. */
export function latestDaily(rule: TaskRecurrenceRule, today: string): string {
  const interval = Math.max(1, rule.recurrenceInterval)
  const k = Math.floor(dayDiff(rule.startDate, today) / interval)
  return addDays(rule.startDate, k * interval)
}

/** Latest selected weekday ≤ today, within an active interval-week block, ≥ the anchor. */
export function latestWeekly(rule: TaskRecurrenceRule, today: string): string | null {
  const interval = Math.max(1, rule.recurrenceInterval)
  const mask = (rule.weekdays & 0b1111111) || 1 << dowOf(rule.startDate)
  // Blocks are counted from the anchor's week (Sunday-based, like the calendar engine —
  // BYDAY weekdays are absolute, independent of the user's week-start preference).
  const anchorWeekStart = addDays(rule.startDate, -dowOf(rule.startDate))
  const todayWeekStart = addDays(today, -dowOf(today))
  const weeks = dayDiff(anchorWeekStart, todayWeekStart) / 7
  let block = Math.floor(weeks / interval) // active block at/just-before today's week
  for (let guard = 0; guard < GUARD && block >= 0; guard++, block--) {
    const blockStart = addDays(anchorWeekStart, block * interval * 7)
    for (let wd = 6; wd >= 0; wd--) {
      if (!(mask & (1 << wd))) continue
      const date = addDays(blockStart, wd)
      if (date <= today && date >= rule.startDate) return date
    }
    if (blockStart <= anchorWeekStart) break
  }
  return null
}

/** Latest monthly occurrence ≤ today (interval months from the anchor). Assumes today ≥ start. */
export function latestMonthly(rule: TaskRecurrenceRule, today: string): string | null {
  const interval = Math.max(1, rule.recurrenceInterval)
  const [ay, am, ad] = parse(rule.startDate)
  const [ty, tm] = parse(today)
  const anchorIndex = ay * 12 + (am - 1)
  const todayIndex = ty * 12 + (tm - 1)
  const nthWeekday = rule.monthlyMode === "nth_weekday"
  const anchorDow = dowOf(rule.startDate)
  const ordinal = Math.ceil(ad / 7) // 1..5: which weekday-of-month the anchor is
  const isLast = ad + 7 > daysInMonth(ay, am)

  let i = Math.floor((todayIndex - anchorIndex) / interval)
  for (let guard = 0; guard < GUARD && i >= 0; guard++, i--) {
    const idx = anchorIndex + i * interval
    const y = Math.floor(idx / 12)
    const m = (idx % 12) + 1
    const dim = daysInMonth(y, m)
    let day: number
    if (nthWeekday) {
      const firstDow = dowOf(fmt(y, m, 1))
      const firstOccDay = 1 + ((anchorDow - firstDow + 7) % 7) // 1..7
      day = isLast
        ? firstOccDay + 7 * Math.floor((dim - firstOccDay) / 7)
        : firstOccDay + 7 * (ordinal - 1)
      if (day > dim) continue // month lacks this occurrence (e.g. a 5th) — try earlier
    } else {
      if (dim < ad) continue // month lacks this day (e.g. the 31st in February)
      day = ad
    }
    const date = fmt(y, m, day)
    if (date <= today && date >= rule.startDate) return date
    // date > today: this month's occurrence is still ahead — step to the previous month.
  }
  return null
}

// --- flexible "once per period, any day" (soft due at the period end) ---

/** The active week containing today, or null in an off-week (interval > 1). */
export function flexibleWeekly(
  rule: TaskRecurrenceRule,
  today: string,
  weekStartsOn: number,
): Cycle | null {
  const interval = Math.max(1, rule.recurrenceInterval)
  const weekFloor = (d: string) => {
    const offset = (((dowOf(d) - weekStartsOn) % 7) + 7) % 7 // 0..6 days since week start
    return addDays(d, -offset)
  }
  const weeks = dayDiff(weekFloor(rule.startDate), weekFloor(today)) / 7
  if (weeks % interval !== 0) return null
  const occurrenceDate = weekFloor(today)
  return { occurrenceDate, dueDate: addDays(occurrenceDate, 6) }
}

/** The active month containing today, or null in an off-month (interval > 1). */
export function flexibleMonthly(rule: TaskRecurrenceRule, today: string): Cycle | null {
  const interval = Math.max(1, rule.recurrenceInterval)
  const [ay, am] = parse(rule.startDate)
  const [ty, tm] = parse(today)
  const months = ty * 12 + (tm - 1) - (ay * 12 + (am - 1))
  if (months % interval !== 0) return null
  return { occurrenceDate: fmt(ty, tm, 1), dueDate: fmt(ty, tm, daysInMonth(ty, tm)) }
}

/**
 * The single cycle a rule should have materialized as of `today` (local date), or null
 * when the rule hasn't started, has ended, or falls in an inactive interval/period.
 * The generator keeps exactly this instance open and retires any other open instance.
 */
export function currentCycle(
  rule: TaskRecurrenceRule,
  today: string,
  weekStartsOn: number,
): Cycle | null {
  if (today < rule.startDate) return null
  if (rule.endDate && today > rule.endDate) return null

  if (rule.flexible && rule.freq === "weekly") {
    return flexibleWeekly(rule, today, weekStartsOn)
  }
  if (rule.flexible && rule.freq === "monthly") {
    return flexibleMonthly(rule, today)
  }

  const occ =
    rule.freq === "weekly"
      ? latestWeekly(rule, today)
      : rule.freq === "monthly"
        ? latestMonthly(rule, today)
        : latestDaily(rule, today)
  return occ ? { occurrenceDate: occ, dueDate: occ } : null
}
