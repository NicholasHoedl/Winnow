// Pure, dependency-free to-do logic. No DB, no `server-only` — so it can be
// unit-tested directly. All timezone-sensitive functions take an explicit
// `now` and IANA `timeZone` for determinism.

import { dueStatus } from "@/lib/date"

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
