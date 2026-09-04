// Pure weekly-review assembly. Dependency-free (no DB, no `server-only`) so it
// unit-tests directly and the page can import its types — the same shape as
// `digest/service.ts`, which is the closest existing cross-module rollup.
//
// This module owns no tables. Everything here is a projection of what the four feature
// modules already store.

import { dayDiff } from "@/lib/date"

export type ReviewTask = { id: string; title: string; completedOn: string }

export type WeekProgress = {
  /** Days of this week that have happened, today included. */
  elapsed: number
  /** The week's length, measured from its own bounds rather than assumed to be seven. */
  total: number
  /** Zero once the week is over. */
  remaining: number
}

/**
 * How much of the week has actually happened.
 *
 * **The denominator used to be the constant 7**, which read as an accusation mid-week:
 * on a Wednesday "3 of 7 days logged" counts four days as missed when three of them have
 * not arrived. Reported from real use, and it is the same class of mistake as calling a
 * day-old goal stalled — judging a period against a bar it has not had the chance to clear.
 *
 * The week's own boundaries are the input rather than an assumed Sunday-to-Saturday, because
 * `weekRange` already derives them from `weekStartsOn`. That keeps this correct for whichever
 * day the account starts its week on WITHOUT this function needing to know which day that
 * is — the setting is honoured by construction rather than by a second reading of it.
 *
 * A past week is a whole week, not "7 of 7 so far": once `today` is beyond the end there is
 * nothing provisional left, and the review of it should read the way it always did.
 */
export function weekProgress(
  weekStart: string,
  weekEnd: string,
  today: string,
): WeekProgress {
  const total = dayDiff(weekStart, weekEnd) + 1
  const elapsed =
    today < weekStart
      ? 0
      : today > weekEnd
        ? total
        : dayDiff(weekStart, today) + 1
  return { elapsed, total, remaining: total - elapsed }
}

export type ReviewMilestone = {
  id: string
  title: string
  goalTitle: string
  completedOn: string
}

/**
 * A completed task that was linked to a goal.
 *
 * These are a SUBSET of `tasks.items`, not an addition to it — the same task appears in
 * both, once as work done and once as work done *toward something*. They exist because
 * the Goals card reported milestones alone, and a milestone is ticked every few weeks at
 * best, so the section that was meant to show goal progress read as dead most weeks while
 * the goals themselves were being actively worked.
 */
export type ReviewGoalTask = {
  id: string
  title: string
  goalTitle: string
  completedOn: string
}

/** One day's eating, already summed and paired with the target in force THAT day. */
export type ReviewMacroDay = {
  date: string
  calories: number
  /** Null when no target period had started by then. */
  targetCalories: number | null
  /** False for a day with nothing logged, which is different from a day logged at zero. */
  logged: boolean
}

export type ReviewMoney = {
  incomeCents: number
  expenseCents: number
  netCents: number
}

export type MacroWeek = {
  daysLogged: number
  /** Logged days that also had a target — the only ones that can be on or off it. */
  daysWithTarget: number
  daysOnTarget: number
}

export type WeeklyReview = {
  weekStart: string
  weekEnd: string
  /** The user's local today. Carried so the summary prompt need not re-derive it. */
  today: string
  tasks: {
    completed: number
    /** The day with the most completions, or null on a tie-free empty week. */
    busiestDay: string | null
    items: ReviewTask[]
  }
  macros: MacroWeek
  milestones: ReviewMilestone[]
  /** Completed tasks that fed a goal — a subset of `tasks.items`. */
  goalTasks: ReviewGoalTask[]
  money: ReviewMoney
  /**
   * How much of this week has happened — what "days logged" is measured AGAINST.
   *
   * Carried on the review rather than recomputed by each consumer so the page's figure and
   * the summary's prose cannot disagree, which is the whole point: the summary is a reading
   * of these figures, so a page saying 3/7 beside prose saying 3 of 4 makes the model look
   * wrong when it is the page that is stale.
   */
  progress: WeekProgress
  /** True when the week holds nothing at all — the page says so rather than showing zeros. */
  isEmpty: boolean
}

/**
 * How far a day's calories may drift and still count as on target.
 *
 * Calories alone decide it, deliberately. Landing inside a band on protein, carbs AND fat
 * simultaneously is not a bar anyone clears often enough for the number to mean anything,
 * and calories is the figure the targets are actually set around — the others are how it
 * is composed.
 */
export const CALORIE_TOLERANCE = 0.1

export function macroWeek(days: readonly ReviewMacroDay[]): MacroWeek {
  let daysLogged = 0
  let daysWithTarget = 0
  let daysOnTarget = 0
  for (const day of days) {
    if (!day.logged) continue
    daysLogged++
    if (day.targetCalories == null || day.targetCalories <= 0) continue
    daysWithTarget++
    const drift =
      Math.abs(day.calories - day.targetCalories) / day.targetCalories
    if (drift <= CALORIE_TOLERANCE) daysOnTarget++
  }
  return { daysLogged, daysWithTarget, daysOnTarget }
}

/** The date with the most completions. Ties go to the earliest, so it is stable. */
export function busiestDay(tasks: readonly ReviewTask[]): string | null {
  const counts = new Map<string, number>()
  for (const task of tasks) {
    counts.set(task.completedOn, (counts.get(task.completedOn) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [date, count] of [...counts].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (count > bestCount) {
      best = date
      bestCount = count
    }
  }
  return best
}

export function buildWeeklyReview(input: {
  weekStart: string
  weekEnd: string
  /** The user's local today, so the week knows how much of itself has happened. */
  today: string
  tasksCompleted: readonly ReviewTask[]
  milestones: readonly ReviewMilestone[]
  goalTasks: readonly ReviewGoalTask[]
  macroDays: readonly ReviewMacroDay[]
  money: ReviewMoney
}): WeeklyReview {
  const macros = macroWeek(input.macroDays)
  const isEmpty =
    input.tasksCompleted.length === 0 &&
    input.milestones.length === 0 &&
    macros.daysLogged === 0 &&
    input.money.incomeCents === 0 &&
    input.money.expenseCents === 0

  return {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    today: input.today,
    tasks: {
      completed: input.tasksCompleted.length,
      busiestDay: busiestDay(input.tasksCompleted),
      items: [...input.tasksCompleted],
    },
    macros,
    milestones: [...input.milestones],
    // Deliberately absent from `isEmpty` above: every goal task is already counted in
    // `tasksCompleted`, so testing it there would be testing the same thing twice.
    goalTasks: [...input.goalTasks],
    money: input.money,
    progress: weekProgress(input.weekStart, input.weekEnd, input.today),
    isEmpty,
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** One line summarising the week, e.g. "12 tasks and 2 milestones". */
export function reviewHeadline(review: WeeklyReview): string {
  const parts: string[] = []
  if (review.tasks.completed > 0) {
    parts.push(plural(review.tasks.completed, "task", "tasks"))
  }
  if (review.milestones.length > 0) {
    parts.push(plural(review.milestones.length, "milestone", "milestones"))
  }
  if (parts.length === 0) return "A quiet week"
  return `${parts.join(" and ")} done`
}
