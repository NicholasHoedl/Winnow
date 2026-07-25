// Pure recurrence scheduling, shared by recurring to-dos and recurring transactions.
// No DB — unit-testable with plain strings. Given a rule and the local "today" (already
// resolved from a timezone by the caller) it answers which cycle(s) should exist. Date
// math is on 'YYYY-MM-DD' strings (DST-immune), mirroring the calendar recurrence engine
// but searching backward for the latest occurrence ≤ today instead of forward-emitting.
//
// Lives in lib/ rather than a module because two modules depend on it, and forking it
// would let the leap-year / nth-weekday / last-Friday / off-week edge cases drift apart.

import { addDays, dayDiff, daysInMonth, dowOf, fmt, parse } from "@/lib/date"

export type RecurrenceFreq = "daily" | "weekly" | "monthly"
export type RecurrenceMonthlyMode = "day_of_month" | "nth_weekday"

// Minimal shape the scheduler needs; the Drizzle row satisfies it structurally.
export type RecurrenceRule = {
  freq: RecurrenceFreq
  recurrenceInterval: number
  // Weekly BYDAY as a 7-bit mask (bit i = weekday i, 0=Sun). 0 = anchor weekday only.
  weekdays: number
  monthlyMode: RecurrenceMonthlyMode
  // "Once per period, any day within it" — only meaningful for weekly/monthly.
  flexible: boolean
  startDate: string // YYYY-MM-DD anchor
  endDate: string | null // inclusive; open-ended if null
}

// One occurrence of a rule. `occurrenceDate` is the stable cycle key (what the unique
// constraint is on); `date` is the day it lands on — a task's due date, a transaction's
// post date. They're equal for specific-day modes; for flexible weekly/monthly `date` is
// the period end.
export type Cycle = { occurrenceDate: string; date: string }

const GUARD = 480 // ~40 years of monthly steps; a safety bound on backward scans

// --- per-frequency "latest occurrence ≤ today" (specific-day modes) ---

/** Latest daily occurrence ≤ today (interval days from the anchor). Assumes today ≥ start. */
export function latestDaily(rule: RecurrenceRule, today: string): string {
  const interval = Math.max(1, rule.recurrenceInterval)
  const k = Math.floor(dayDiff(rule.startDate, today) / interval)
  return addDays(rule.startDate, k * interval)
}

/** Latest selected weekday ≤ today, within an active interval-week block, ≥ the anchor. */
export function latestWeekly(rule: RecurrenceRule, today: string): string | null {
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
export function latestMonthly(rule: RecurrenceRule, today: string): string | null {
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
  rule: RecurrenceRule,
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
  return { occurrenceDate, date: addDays(occurrenceDate, 6) }
}

/** The active month containing today, or null in an off-month (interval > 1). */
export function flexibleMonthly(rule: RecurrenceRule, today: string): Cycle | null {
  const interval = Math.max(1, rule.recurrenceInterval)
  const [ay, am] = parse(rule.startDate)
  const [ty, tm] = parse(today)
  const months = ty * 12 + (tm - 1) - (ay * 12 + (am - 1))
  if (months % interval !== 0) return null
  return { occurrenceDate: fmt(ty, tm, 1), date: fmt(ty, tm, daysInMonth(ty, tm)) }
}

/**
 * The single cycle a rule should have materialized as of `today` (local date), or null
 * when the rule hasn't started, has ended, or falls in an inactive interval/period.
 * The generator keeps exactly this instance open and retires any other open instance.
 */
export function currentCycle(
  rule: RecurrenceRule,
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
  return occ ? { occurrenceDate: occ, date: occ } : null
}

/** How far back a catch-up will reach. A rule dormant for years shouldn't suddenly
 * post hundreds of rows; older occurrences are deliberately skipped, not queued. */
export const MAX_CATCHUP_DAYS = 400

/**
 * Every distinct cycle occurring in (`fromExclusive`, `toInclusive`] — the set a
 * materializer owes when it hasn't run for a while. Unlike {@link currentCycle}, which
 * answers "what should exist right now", this answers "what did I miss": three unopened
 * months of rent are three cycles, not one.
 *
 * Implemented as a day-scan over `currentCycle` rather than a second forward generator.
 * That reuses the engine whose edge cases are already tested, and "every cycle that
 * would have been current on some day in the window" is correct by construction. The
 * window is clamped to {@link MAX_CATCHUP_DAYS}, measured back from `toInclusive`.
 */
export function cyclesInRange(
  rule: RecurrenceRule,
  fromExclusive: string,
  toInclusive: string,
  weekStartsOn: number,
): Cycle[] {
  const span = dayDiff(fromExclusive, toInclusive)
  if (span <= 0) return []
  const after =
    span > MAX_CATCHUP_DAYS
      ? addDays(toInclusive, -MAX_CATCHUP_DAYS)
      : fromExclusive

  const cycles: Cycle[] = []
  const seen = new Set<string>()
  for (
    let day = addDays(after, 1);
    day <= toInclusive;
    day = addDays(day, 1)
  ) {
    const cycle = currentCycle(rule, day, weekStartsOn)
    // A cycle that started before the window was already handled last time.
    if (!cycle || cycle.occurrenceDate <= after) continue
    if (seen.has(cycle.occurrenceDate)) continue
    seen.add(cycle.occurrenceDate)
    cycles.push(cycle)
  }
  return cycles
}

/**
 * The last day of the period `today` falls in for this rule: end of month for monthly,
 * end of the user's week for weekly, the day itself for daily.
 *
 * Used to make a schedule change take effect NEXT period. Moving a monthly bill from the
 * 1st to the 15th on the 10th would otherwise post it twice in the same month — once
 * already on the 1st, again on the 15th.
 */
export function periodEnd(
  rule: RecurrenceRule,
  today: string,
  weekStartsOn: number,
): string {
  if (rule.freq === "monthly") {
    const [year, month] = parse(today)
    return fmt(year, month, daysInMonth(year, month))
  }
  if (rule.freq === "weekly") {
    const offset = (((dowOf(today) - weekStartsOn) % 7) + 7) % 7
    return addDays(today, 6 - offset)
  }
  return today
}
