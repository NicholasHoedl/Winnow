// Pure, dependency-free to-do logic. No DB, no `server-only` — so it can be
// unit-tested directly. All timezone-sensitive functions take an explicit
// `now` and IANA `timeZone` for determinism.

import { dueStatus } from "@/lib/date"
import type { Cycle } from "@/lib/recurrence"

export type TaskSummaryInput = {
  dueDate: string | null
  status: "open" | "done"
}

/** The four sections the to-do list renders, in the order it renders them. */
export type TaskBuckets<T> = {
  overdue: T[]
  today: T[]
  upcoming: T[]
  someday: T[]
}

/**
 * Split open tasks into date sections.
 *
 * `someday` — no due date — is the point of this function. `dueStatus` has always returned
 * a distinct `"none"`, but nothing rendered it: the list was flat and undated tasks simply
 * sank to the bottom, indistinguishable from far-future ones. A task with no deadline is
 * not a task that missed one.
 *
 * INPUT ORDER IS PRESERVED within each bucket. Manual position (`tasks.sort_order`) is
 * applied by the query's ORDER BY, so re-sorting here would silently undo a drag.
 */
export function bucketTasks<T extends TaskSummaryInput>(
  tasks: T[],
  now: Date,
  timeZone: string,
): TaskBuckets<T> {
  const buckets: TaskBuckets<T> = {
    overdue: [],
    today: [],
    upcoming: [],
    someday: [],
  }
  for (const task of tasks) {
    if (task.status !== "open") continue
    switch (dueStatus(task.dueDate, now, timeZone)) {
      case "overdue":
        buckets.overdue.push(task)
        break
      case "due-today":
        buckets.today.push(task)
        break
      case "upcoming":
        buckets.upcoming.push(task)
        break
      default:
        buckets.someday.push(task)
    }
  }
  return buckets
}

export type TaskSummary<T> = {
  overdueCount: number
  dueTodayCount: number
  dueToday: T[]
}

/** Dashboard summary: overdue count + due-today tasks, among OPEN tasks only. */
export function summarizeTasks<T extends TaskSummaryInput>(
  tasks: T[],
  now: Date,
  timeZone: string,
): TaskSummary<T> {
  let overdueCount = 0
  const dueToday: T[] = []
  for (const task of tasks) {
    if (task.status !== "open") continue
    const status = dueStatus(task.dueDate, now, timeZone)
    if (status === "overdue") overdueCount++
    else if (status === "due-today") dueToday.push(task)
  }
  return { overdueCount, dueTodayCount: dueToday.length, dueToday }
}

/** Only the schedule fields the label reads; the Drizzle row satisfies it structurally. */
export type RepeatShape = {
  freq: "daily" | "weekly" | "monthly"
  recurrenceInterval: number
}

const REPEAT_UNIT = { daily: "day", weekly: "week", monthly: "month" } as const

/**
 * "Daily" / "Weekly" / "Every 2 weeks" — the badge wording for a repeating task.
 *
 * Hoisted here in T7c. It existed character-for-character twice, in `task-item.tsx` and
 * `recurrence-manager.tsx`, and the habit cards would have made three. One phrasing, so
 * the same rule can't read differently depending on where you look at it.
 */
export function repeatLabel(series: RepeatShape): string {
  const unit = REPEAT_UNIT[series.freq]
  if (series.recurrenceInterval > 1) {
    return `Every ${series.recurrenceInterval} ${unit}s`
  }
  return { daily: "Daily", weekly: "Weekly", monthly: "Monthly" }[series.freq]
}

/**
 * Whether re-opening this completed task would silently destroy it.
 *
 * `syncRuleInstances` retires every OPEN instance of a rule that isn't the current cycle,
 * and it runs on each render of /activity, the dashboard and the digest. So un-completing an
 * off-cycle instance turns a durable history row into an open one that the very next page
 * load deletes — the completion disappears with nothing to show it ever existed.
 *
 * A one-off task has no rule to retire it and is always safe. A rule that has ended has no
 * current cycle at all, so nothing can be re-opened under it.
 *
 * Lived in `todos/habits.ts` until T12a retired that file. It never was habit maths: it
 * reads a task against a recurrence cycle and guards `toggleTaskStatus`, which is this
 * module's business and survives the habits rewrite untouched.
 */
export function reopenWouldDestroy(
  task: { seriesId: string | null; occurrenceDate: string | null },
  cycle: Cycle | null,
): boolean {
  if (!task.seriesId || !task.occurrenceDate) return false
  return cycle === null || cycle.occurrenceDate !== task.occurrenceDate
}
