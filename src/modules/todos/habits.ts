// Pure habit/streak math over the recurring-task engine. No DB — the caller supplies the
// cycles a rule owed, the ones it completed, and the ones it skipped.
//
// Kept beside service.ts rather than inside it, the way `src/lib/recurrence.ts` is its own
// pure file: this is a self-contained calculation with its own vocabulary.
//
// The load-bearing separation: **streaks are counted in CYCLES, the heatmap is drawn in
// DAYS, and the two never mix.** A weekly habit's streak is consecutive weeks, not
// consecutive days — and for a `flexible` rule `occurrenceDate` is the period START
// rather than the day anything happened, so counting days from it would be wrong for
// every rule that isn't daily. Days come from `completedAt` instead, and only feed the
// heatmap, which is display.

import { addDays, dayDiff, dowOf } from "@/lib/date"
import type { Cycle } from "@/lib/recurrence"

export type HabitCycleStatus = "completed" | "skipped" | "missed"
export type HabitCycle = { occurrenceDate: string; status: HabitCycleStatus }

/**
 * Classify every cycle the rule owed over the window.
 *
 * `expected` is what `cyclesInRange` produced, `completed` and `skipped` are keyed on the
 * same `occurrenceDate` string — that shared key is the whole reason this is a set
 * intersection rather than date arithmetic.
 */
export function habitCycles(
  expected: readonly Cycle[],
  completed: ReadonlySet<string>,
  skipped: ReadonlySet<string>,
): HabitCycle[] {
  return [...expected]
    .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))
    .map((cycle) => ({
      occurrenceDate: cycle.occurrenceDate,
      // Completed wins over skipped: skipping and then doing it anyway is a completion,
      // and the exception row outlives the decision that wrote it.
      status: completed.has(cycle.occurrenceDate)
        ? "completed"
        : skipped.has(cycle.occurrenceDate)
          ? "skipped"
          : "missed",
    }))
}

/**
 * The run of completions ending at the most recent cycle.
 *
 * Two rules that are easy to get wrong:
 *
 * - **A skip is neutral.** It neither extends nor breaks the streak. That is the entire
 *   reason skip-once is stored as its own row rather than as a missing task — deciding in
 *   advance not to do something is not the same as failing to do it.
 * - **A trailing miss is forgiven exactly once.** The last cycle is usually the CURRENT
 *   one, still in progress: at 9am on a daily habit it is not yet done, and treating that
 *   as a miss would report a broken streak every morning until you did it. One trailing
 *   miss is skipped over; a second one is a real break.
 */
export function currentStreak(cycles: readonly HabitCycle[]): number {
  let streak = 0
  let forgiven = false
  for (let i = cycles.length - 1; i >= 0; i--) {
    const status = cycles[i].status
    if (status === "completed") {
      streak++
      continue
    }
    if (status === "skipped") continue
    // missed
    if (!forgiven && i === cycles.length - 1) {
      forgiven = true
      continue
    }
    break
  }
  return streak
}

/** The longest run of completions anywhere in the window. Skips stay neutral. */
export function longestStreak(cycles: readonly HabitCycle[]): number {
  let best = 0
  let run = 0
  for (const cycle of cycles) {
    if (cycle.status === "completed") {
      run++
      best = Math.max(best, run)
    } else if (cycle.status === "missed") {
      run = 0
    }
    // skipped: carry the run across untouched
  }
  return best
}

/**
 * Completions over the cycles that actually asked for one.
 *
 * Skipped cycles are excluded from the denominator, not counted as failures — you opted
 * out deliberately, and scoring that against yourself would make the honest thing to do
 * (skipping) look worse than quietly ignoring it.
 */
export function completionRate(cycles: readonly HabitCycle[]): {
  completed: number
  expected: number
  percent: number
} {
  let completed = 0
  let expected = 0
  for (const cycle of cycles) {
    if (cycle.status === "skipped") continue
    expected++
    if (cycle.status === "completed") completed++
  }
  return {
    completed,
    expected,
    percent: expected === 0 ? 0 : Math.round((completed / expected) * 100),
  }
}

export type HeatmapCell = { date: string; col: number; row: number }
export type HeatmapGrid = { cells: HeatmapCell[]; cols: number; rows: number }

/**
 * Lay consecutive dates out as a contribution-style grid — one column per week, one row
 * per weekday, respecting the user's week-start preference.
 *
 * This lives here rather than in `charts/geometry.ts`, where the rest of the chart maths
 * sits, on purpose: everything in that file is unit-agnostic coordinate maths, and this
 * is calendar structure. Putting it there would hand every budget and meals chart a date
 * dependency for the sake of one consumer.
 */
export function heatmapLayout(
  dates: readonly string[],
  weekStartsOn = 0,
): HeatmapGrid {
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

/** Every date from `from` to `to` inclusive. Empty when `to` precedes `from`. */
export function dateRange(from: string, to: string): string[] {
  const span = dayDiff(from, to)
  if (span < 0) return []
  return Array.from({ length: span + 1 }, (_, i) => addDays(from, i))
}

/**
 * Whether re-opening this completed task would silently destroy it.
 *
 * `syncRuleInstances` retires every OPEN instance of a rule that isn't the current cycle,
 * and it runs on each render of /todos, the dashboard and the digest. So un-completing an
 * off-cycle instance turns a durable history row into an open one that the very next page
 * load deletes — the completion disappears with nothing to show it ever existed, and the
 * habit's streak silently changes underneath it.
 *
 * A one-off task has no rule to retire it and is always safe. A rule that has ended has no
 * current cycle at all, so nothing can be re-opened under it.
 */
export function reopenWouldDestroy(
  task: { seriesId: string | null; occurrenceDate: string | null },
  cycle: Cycle | null,
): boolean {
  if (!task.seriesId || !task.occurrenceDate) return false
  return cycle === null || cycle.occurrenceDate !== task.occurrenceDate
}
