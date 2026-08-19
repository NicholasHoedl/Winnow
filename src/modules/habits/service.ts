// Pure quota-habit maths. No DB, no `server-only` — the caller supplies the entries and
// the window they were loaded for, so this is directly unit-testable.
//
// Everything here keys on a **period start date**: a `YYYY-MM-DD` that identifies the day,
// week or month an entry belongs to. One key type for all three cadences, and because ISO
// dates compare lexicographically == chronologically, the keys sort and range-check with
// plain string comparison.
//
// The trap this design removes is worth naming, because the feature it replaces was built
// around it. T7c had to insist that "streaks count CYCLES, the heatmap counts DAYS, and the
// two never mix" — for a `flexible` recurrence `occurrenceDate` is the period START, so a
// day grid drawn from it put every completion on a Sunday, and the real day had to be
// recovered from `completedAt`. Here `on_date` IS the local day, recorded when the entry was
// logged. Periods are derived from it rather than the other way round, so the separation
// still exists but there is nothing left to get wrong.

import { addDays, dayDiff, dowOf, shiftMonth, weekRange } from "@/lib/date"
import { formatAmount, roundAmount } from "@/lib/format"

export type HabitPeriod = "day" | "week" | "month"

/** The habit fields the maths reads. The Drizzle row satisfies it structurally. */
export type HabitRule = {
  period: HabitPeriod
  targetCount: number
  /**
   * The measured variant's target — 20 words, 5.5 km. Null means the habit counts
   * sessions, which is what `targetCount` is for.
   *
   * These two are never both in force. `resolveQuota` is the only thing that decides
   * between them, so nothing else in the app has to hold the rule.
   */
  targetAmount: number | null
  /** What the amount is IN. Paired with `targetAmount`; null exactly when it is. */
  unit: string | null
  startDate: string
  endDate: string | null
}

/** What a quota is, once the two ways of expressing one have been resolved to a number. */
export type Quota = {
  /** The figure a period is judged against, whichever field it came from. */
  target: number
  /** True when that figure is an AMOUNT rather than a count of sessions. */
  measured: boolean
  /** Null for a session habit. */
  unit: string | null
}

/** The entry fields the maths reads. `amount` is null for a session, and on old rows. */
export type EntryLike = { onDate: string; amount?: number | null }

/**
 * Whether a habit is measured — the single place that decision is made.
 *
 * Derived from `targetAmount` rather than stored in a `kind` column, because there is no
 * third state and a stored discriminator could disagree with the number it describes:
 * `kind: "measured"` beside `target_amount: null` divides by zero. The same reasoning
 * `endDate: null` and `goalId: null` already carry — absence IS the other case.
 *
 * A non-positive or non-finite amount is treated as NOT measured, which degrades a corrupt
 * row to session counting rather than propagating NaN through a streak. See `resolveQuota`.
 *
 * A type PREDICATE rather than a plain boolean, so `resolveQuota` can read `targetAmount`
 * as a number without an assertion. The alternative was `habit.targetAmount!` guarded by a
 * call TypeScript cannot see through — and the only way to avoid that without a predicate
 * is to inline the check, which would put this rule in two places.
 */
export function isMeasured<T extends Pick<HabitRule, "targetAmount">>(
  habit: T,
): habit is T & { targetAmount: number } {
  const amount = habit.targetAmount
  return amount !== null && Number.isFinite(amount) && amount > 0
}

/**
 * What one entry adds to its period's tally.
 *
 * A session is worth 1. A measured entry is worth what it recorded — and an entry with no
 * amount is worth NOTHING to a measured habit, which is the honest reading rather than a
 * convenient one. It matters because a habit can be edited from sessions to an amount, and
 * every entry logged before that carries `amount: null`: those sessions genuinely did not
 * record a quantity, and counting each as one word (or one kilometre) would invent data.
 * The dialog says so before you make the switch.
 */
function contributionOf(entry: EntryLike, measured: boolean): number {
  if (!measured) return 1
  const amount = entry.amount
  if (amount === null || amount === undefined || !Number.isFinite(amount))
    return 0
  return amount
}

/**
 * The figure a period is judged against, and which kind of figure it is.
 *
 * Never below 1 for a session habit, and that is not paranoia: `habitInputSchema` guards
 * every action path, but `account/import.ts` runs no Zod at all — it maps JSON straight
 * onto columns. A hand-edited backup carrying `targetCount: 0` would reach this file and
 * divide by zero. A measured target needs no such floor because `isMeasured` has already
 * rejected everything that is not a positive finite number.
 */
export function resolveQuota(
  habit: Pick<HabitRule, "targetCount" | "targetAmount" | "unit">,
): Quota {
  if (isMeasured(habit)) {
    return { target: habit.targetAmount, measured: true, unit: habit.unit }
  }
  return {
    target: Math.max(1, Math.trunc(habit.targetCount)),
    measured: false,
    unit: null,
  }
}

function targetOf(
  habit: Pick<HabitRule, "targetCount" | "targetAmount" | "unit">,
): number {
  return resolveQuota(habit).target
}

/** The start date of the period `date` falls in — the key everything buckets on. */
export function periodStart(
  date: string,
  period: HabitPeriod,
  weekStartsOn = 0,
): string {
  if (period === "day") return date
  if (period === "week") return weekRange(date, weekStartsOn).start
  return `${date.slice(0, 7)}-01`
}

/**
 * Move `n` whole periods from a period start. Negative goes back.
 *
 * Months anchor on the 1st and shift through `shiftMonth`, which dissolves the classic
 * "add one month to January 31" problem rather than handling it: there is no 31st to
 * overflow, so nothing can land in March.
 */
export function shiftPeriod(
  start: string,
  period: HabitPeriod,
  n: number,
): string {
  if (period === "day") return addDays(start, n)
  if (period === "week") return addDays(start, n * 7)
  return `${shiftMonth(start.slice(0, 7), n)}-01`
}

/** The inclusive bounds of the period `date` falls in. */
export function periodRange(
  date: string,
  period: HabitPeriod,
  weekStartsOn = 0,
): { start: string; end: string } {
  const start = periodStart(date, period, weekStartsOn)
  if (period === "day") return { start, end: start }
  if (period === "week") return { start, end: addDays(start, 6) }
  return { start, end: addDays(shiftPeriod(start, "month", 1), -1) }
}

/**
 * The earliest date any of today's three current periods can begin.
 *
 * A read that shows only `adherence` — done/target for the period containing today — needs
 * no entry older than this, whatever cadence its habits use. That makes it the floor
 * `getHabitStrip` bounds its scan at, in place of the 400 days a streak has to walk.
 *
 * It is the earlier of the current week's start and the current month's, **not simply the
 * month's**: a week straddles the month boundary, so on the 1st of a month the current week
 * usually began in the previous one. Taking the month alone would silently undercount every
 * weekly habit for the first few days of most months — a bug that appears and disappears on
 * a calendar, which is the kind that survives a long time.
 */
export function currentPeriodFloor(today: string, weekStartsOn = 0): string {
  const week = periodStart(today, "week", weekStartsOn)
  const month = periodStart(today, "month")
  return week < month ? week : month
}

/**
 * What each period holds, keyed by period start.
 *
 * Sessions per period for a session habit, and the SUM OF AMOUNTS for a measured one — one
 * function rather than two, because everything downstream compares this against a target
 * and neither the streak nor the window percentage has any reason to know which kind of
 * number it is holding. Teaching this and `resolveQuota` about the measured variant is
 * what turned the feature on: `habitStreak` and `windowAdherence` needed no change at all.
 *
 * Takes the habit rather than a bare `period`, and declares exactly the two fields it
 * reads — the same discipline `adherence` below documents, for the same reason.
 */
export function tallyByPeriod(
  entries: readonly EntryLike[],
  habit: Pick<HabitRule, "period" | "targetAmount">,
  weekStartsOn = 0,
): Map<string, number> {
  const measured = isMeasured(habit)
  const tally = new Map<string, number>()
  for (const entry of entries) {
    const key = periodStart(entry.onDate, habit.period, weekStartsOn)
    tally.set(key, (tally.get(key) ?? 0) + contributionOf(entry, measured))
  }
  // Rounded once per period rather than per addition: summing first keeps the arithmetic
  // exact for as long as it can be, and nothing reads the intermediate values.
  for (const [key, value] of tally) tally.set(key, roundAmount(value))
  return tally
}

/** Entries per local day — the heatmap's input. No period involved. */
export function tallyByDay(entries: readonly EntryLike[]): Map<string, number> {
  const tally = new Map<string, number>()
  for (const entry of entries) {
    tally.set(entry.onDate, (tally.get(entry.onDate) ?? 0) + 1)
  }
  return tally
}

export type Adherence = {
  /** Inclusive bounds of the period containing the date asked about. */
  start: string
  end: string
  /**
   * What was logged in it. NOT capped — four sessions against a target of three reads 4.
   *
   * Sessions for a session habit, the summed amount for a measured one. Which of the two
   * it is, is `measured` below rather than something a reader infers from the number.
   */
  done: number
  target: number
  /**
   * Whether `done`/`target` are an AMOUNT rather than a count of sessions.
   *
   * Carried on the READING rather than left for each surface to re-derive from the habit
   * row, and that is what kept this feature out of four card shapes: every surface drawing
   * a quota already receives an `Adherence`, so the meter, the numbers and the log control
   * all learn the variant from the same object. `HabitStripCard` gained no field for it.
   */
  measured: boolean
  /** The unit `done` and `target` are in, or null for a session habit. */
  unit: string | null
  /** 0–100, CLAMPED at 100 so an overshoot cannot overflow a progress bar. */
  percent: number
  /** How many more to hit the target. Floored at 0. */
  remaining: number
  met: boolean
}

/**
 * done/target for the period containing `today`. The reading the rail and the page show.
 *
 * `done` is uncapped and `percent` is clamped, deliberately differently: "4 of 3" is both
 * true and motivating, while a 133% bar is a rendering bug.
 */
export function adherence(
  tally: ReadonlyMap<string, number>,
  // Only the fields it actually reads, not the whole rule. That is what lets
  // `getHabitStrip` select a handful of columns instead of thirteen — widening this was
  // the enabling change, and a test calls it with a bare literal so re-adding a
  // `startDate` read here fails loudly rather than breaking the strip's column list.
  //
  // It went from two fields to four when measured habits were turned on, and the strip's
  // column list moved with it in the same commit. That is the guard working, not a hole.
  habit: Pick<HabitRule, "period" | "targetCount" | "targetAmount" | "unit">,
  today: string,
  weekStartsOn = 0,
): Adherence {
  const { start, end } = periodRange(today, habit.period, weekStartsOn)
  const { target, measured, unit } = resolveQuota(habit)
  const done = tally.get(start) ?? 0
  return {
    start,
    end,
    done,
    target,
    measured,
    unit,
    percent: Math.min(100, Math.round((done / target) * 100)),
    // Rounded because it is a subtraction of amounts and is rendered directly: 20 - 12.3
    // is 7.699999999999999 in binary floating point.
    remaining: Math.max(0, roundAmount(target - done)),
    met: done >= target,
  }
}

export type HabitStreak = { current: number; best: number }

/** A corrupt `start_date` in 1900 must not spin the walk. Far past any real window. */
const MAX_PERIODS = 500

/**
 * The oldest period `windowAdherence` may put in its DENOMINATOR.
 *
 * Both boundaries can land mid-period, and a period only half-covered cannot fairly be
 * measured against a whole period's target — so each is rounded UP to the next period that
 * is genuinely whole:
 *
 * - **`from` is a data boundary.** Entries are loaded from it, so if it falls on a Thursday
 *   the week containing it is only partly loaded. Judging that week would read the edge of
 *   the query as a miss and report a break that is really the end of the data.
 * - **`startDate` is a real-world boundary.** A habit created on Saturday existed for one
 *   day of that week; scoring "3 a week" against it would open every new weekly habit with
 *   a guaranteed miss.
 *
 * A boundary that already sits on a period start needs no rounding, which is the common
 * case for `startDate` on a daily habit — every day is its own whole period.
 *
 * **`habitStreak` deliberately does not use this.** A streak has no denominator, so a
 * target met inside a partial period is simply met — and rounding up there would put a
 * habit created today entirely below its own floor, unable to score however many times it
 * was logged. That was shipped once and caught by the e2e: 3/3 and "Streak 0".
 */
function judgeableFloor(
  habit: HabitRule,
  from: string,
  weekStartsOn: number,
): string {
  const roundUp = (date: string) => {
    const start = periodStart(date, habit.period, weekStartsOn)
    return start === date ? start : shiftPeriod(start, habit.period, 1)
  }
  const data = roundUp(from)
  const started = roundUp(habit.startDate)
  return started > data ? started : data
}

/**
 * Consecutive periods that met the target, ending at the most recent one.
 *
 * `window` is the span the entries were LOADED for, and passing it is load-bearing: a walk
 * that ran past `window.from` would read the edge of the query as a miss and report a break
 * that is really the end of the data. Clamped, the worst case is an under-report.
 *
 * Three rules, the first inherited from ADR-0009 and restated in periods:
 *
 * - **The period in progress is forgiven exactly once.** At 9am on Monday a "3 a week"
 *   habit stands at 0 of 3, and judging it would report a broken streak every Monday
 *   morning. If it has met target it counts; if not it is stepped over without breaking.
 *   Every earlier period is judged normally.
 * - **Forgiveness applies only to a period actually in progress.** A habit whose `endDate`
 *   has passed has a finished last period, so it is judged — and anchoring the walk there
 *   rather than at today means it still shows the streak it ended with instead of decaying
 *   to zero once it stops being current.
 * - **Nothing before `startDate` is a miss.** A habit created two weeks ago with both weeks
 *   met reads 2, not "broken in week three" against a void it was never asked about.
 *
 * `best` comes out of the same backward walk — one bucketing pass, one traversal.
 */
export function habitStreak(
  tally: ReadonlyMap<string, number>,
  habit: HabitRule,
  window: { from: string; to: string },
  weekStartsOn = 0,
): HabitStreak {
  const target = targetOf(habit)
  // The period the habit started in, or the oldest one loaded — whichever is later.
  //
  // Deliberately NOT rounded up to a whole period, unlike `windowAdherence`'s floor. A
  // habit created today lives entirely inside one partial period, and meeting its quota
  // there is precisely the moment this feature exists for. A partial period is an unfair
  // DENOMINATOR, which is why the ring rounds up; a streak has no denominator, and a target
  // met inside part of a period was harder to hit, not weaker.
  const floor = periodStart(
    habit.startDate > window.from ? habit.startDate : window.from,
    habit.period,
    weekStartsOn,
  )

  const ended = habit.endDate !== null && habit.endDate < window.to
  const anchorDate = ended ? habit.endDate! : window.to
  let cursor = periodStart(anchorDate, habit.period, weekStartsOn)

  let current = 0
  let best = 0
  let run = 0
  // Still extending `current`; goes false at the first genuine miss.
  let extending = true
  let isAnchor = true

  for (let i = 0; i < MAX_PERIODS && cursor >= floor; i++) {
    if ((tally.get(cursor) ?? 0) >= target) {
      run++
      if (extending) current++
      if (run > best) best = run
    } else if (isAnchor && !ended) {
      // In progress: neither a win nor a miss. `run` carries across it untouched, the same
      // way a skipped cycle used to.
    } else {
      extending = false
      run = 0
    }
    isAnchor = false
    cursor = shiftPeriod(cursor, habit.period, -1)
  }

  return { current, best }
}

/**
 * Periods met over the whole window — the page's ring, and the honest successor to T7c's
 * `completionRate`.
 *
 * The period in progress is excluded from `elapsed` rather than counted as a miss, for the
 * same reason the streak forgives it: a figure that drops every time a week turns over is
 * measuring the clock, not the habit.
 */
export function windowAdherence(
  tally: ReadonlyMap<string, number>,
  habit: HabitRule,
  window: { from: string; to: string },
  weekStartsOn = 0,
): { met: number; elapsed: number; percent: number } {
  const target = targetOf(habit)
  const floor = judgeableFloor(habit, window.from, weekStartsOn)

  const ended = habit.endDate !== null && habit.endDate < window.to
  const anchorDate = ended ? habit.endDate! : window.to
  let cursor = periodStart(anchorDate, habit.period, weekStartsOn)
  if (!ended) cursor = shiftPeriod(cursor, habit.period, -1)

  let met = 0
  let elapsed = 0
  for (let i = 0; i < MAX_PERIODS && cursor >= floor; i++) {
    elapsed++
    if ((tally.get(cursor) ?? 0) >= target) met++
    cursor = shiftPeriod(cursor, habit.period, -1)
  }

  return {
    met,
    elapsed,
    percent: elapsed === 0 ? 0 : Math.round((met / elapsed) * 100),
  }
}

const PERIOD_NOUN: Record<HabitPeriod, string> = {
  day: "day",
  week: "week",
  month: "month",
}

const EVERY_LABEL: Record<HabitPeriod, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
}

/**
 * "Daily" / "3× a week" / "20 words a day" — the badge wording, alongside `repeatLabel`.
 *
 * A measured habit never collapses to "Daily", however round its target is: "1 L a day"
 * and "one session a day" are different commitments, and this is the only line on the card
 * that says which one you made.
 */
export function periodLabel(
  habit: Pick<HabitRule, "period" | "targetCount" | "targetAmount" | "unit">,
): string {
  const { target, measured, unit } = resolveQuota(habit)
  if (measured) {
    return `${formatAmount(target)} ${unit} a ${PERIOD_NOUN[habit.period]}`
  }
  if (target === 1) return EVERY_LABEL[habit.period]
  return `${target}× a ${PERIOD_NOUN[habit.period]}`
}

/**
 * "today" / "this week" / "this month" — the span an `adherence` count belongs to.
 *
 * Was private to `habits-view.tsx` until the dashboard card needed the same phrase. The
 * strings are unchanged on purpose: the e2e asserts "0/3 this week" and "0/1 today", so
 * moving this file-to-file must not move the wording with it.
 */
export function periodPhrase(period: HabitPeriod): string {
  if (period === "day") return "today"
  return period === "week" ? "this week" : "this month"
}

export type GridCell = { date: string; col: number; row: number }
export type CalendarGrid = { cells: GridCell[]; cols: number; rows: number }

/**
 * Lay consecutive dates out as a contribution-style grid — one column per week, one row per
 * weekday, respecting the user's week-start preference.
 *
 * Moved here from `todos/habits.ts` in T12a, unchanged. It lives in a module rather than in
 * `charts/geometry.ts`, where the rest of the chart maths sits, for the reason it always
 * did: everything in that file is unit-agnostic coordinate maths, and this is calendar
 * structure. Putting it there would hand every budget and meals chart a date dependency for
 * the sake of one consumer. It is not in `lib/date.ts` either — it takes `weekStartsOn` and
 * emits grid coordinates, which is display, not date arithmetic.
 *
 * The types are renamed from `HeatmapCell`/`HeatmapGrid` because
 * `components/charts/heatmap.tsx` exports a different `HeatmapCell` — render props rather
 * than layout coordinates — and the view imports both.
 */
export function heatmapLayout(
  dates: readonly string[],
  weekStartsOn = 0,
): CalendarGrid {
  if (dates.length === 0) return { cells: [], cols: 0, rows: 7 }

  const firstRow = (((dowOf(dates[0]) - weekStartsOn) % 7) + 7) % 7
  // Anchor on the week-start at or before the first date, so column 0 is a real week
  // boundary and a partial first week simply leaves its leading cells empty rather than
  // shifting every row up.
  const gridStart = addDays(dates[0], -firstRow)

  let cols = 0
  const cells = dates.map((date) => {
    const offset = dayDiff(gridStart, date)
    const col = Math.floor(offset / 7)
    if (col + 1 > cols) cols = col + 1
    return { date, col, row: offset % 7 }
  })
  return { cells, cols, rows: 7 }
}
