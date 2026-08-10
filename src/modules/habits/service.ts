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

export type HabitPeriod = "day" | "week" | "month"

/** The habit fields the maths reads. The Drizzle row satisfies it structurally. */
export type HabitRule = {
  period: HabitPeriod
  targetCount: number
  startDate: string
  endDate: string | null
}

/** The entry fields the maths reads. */
export type EntryLike = { onDate: string }

/**
 * Never below 1.
 *
 * Not paranoia: `habitInputSchema` guards every action path, but `account/import.ts` runs
 * no Zod at all — it maps JSON straight onto columns. A hand-edited backup carrying
 * `targetCount: 0` would reach this file and divide by zero.
 */
function targetOf(habit: Pick<HabitRule, "targetCount">): number {
  return Math.max(1, Math.trunc(habit.targetCount))
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
 * Entries per period, keyed by period start.
 *
 * Counts ROWS, not `amount` — the measured variant ("20 words") is a later tranche, and
 * counting a null amount as anything but one session would be inventing data.
 */
export function tallyByPeriod(
  entries: readonly EntryLike[],
  period: HabitPeriod,
  weekStartsOn = 0,
): Map<string, number> {
  const tally = new Map<string, number>()
  for (const entry of entries) {
    const key = periodStart(entry.onDate, period, weekStartsOn)
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }
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
  /** Entries logged in it. NOT capped — four sessions against a target of three reads 4. */
  done: number
  target: number
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
  habit: HabitRule,
  today: string,
  weekStartsOn = 0,
): Adherence {
  const { start, end } = periodRange(today, habit.period, weekStartsOn)
  const target = targetOf(habit)
  const done = tally.get(start) ?? 0
  return {
    start,
    end,
    done,
    target,
    percent: Math.min(100, Math.round((done / target) * 100)),
    remaining: Math.max(0, target - done),
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

/** "Daily" / "3× a week" / "Monthly" — the badge wording, alongside `repeatLabel`. */
export function periodLabel(
  habit: Pick<HabitRule, "period" | "targetCount">,
): string {
  const target = targetOf(habit)
  if (target === 1) return EVERY_LABEL[habit.period]
  return `${target}× a ${PERIOD_NOUN[habit.period]}`
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
