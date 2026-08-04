// Pure weekly-review assembly. Dependency-free (no DB, no `server-only`) so it
// unit-tests directly and the page can import its types — the same shape as
// `digest/service.ts`, which is the closest existing cross-module rollup.
//
// This module owns no tables. Everything here is a projection of what the four feature
// modules already store.

export type ReviewTask = { id: string; title: string; completedOn: string }

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
