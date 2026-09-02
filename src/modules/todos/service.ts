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

/** The fields `/activity`'s search box reads off a task. */
export type TaskSearchInput = {
  title: string
  notes: string | null
}

/**
 * Narrow a task list to the rows matching a free-text query, on title or notes.
 *
 * **This is the page's own box, not the ⌘K palette's.** That one is a server-side `ilike`
 * across every module in the app; this narrows a list `/activity` already holds in memory,
 * so it costs no round trip and can run on every keystroke without a debounce.
 *
 * Notes are searched as well as titles because a task whose detail lives in its notes is
 * exactly the one whose title you cannot remember — the palette made the same call.
 *
 * An empty or whitespace-only query returns the input UNCHANGED rather than nothing: the box
 * is a filter that is simply off until you type in it.
 *
 * INPUT ORDER IS PRESERVED, for the reason `bucketTasks` preserves it — `tasks.sort_order`
 * carries the manual drag, and re-sorting here would silently undo one.
 */
export function searchTasks<T extends TaskSearchInput>(
  tasks: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase()
  if (needle === "") return tasks
  return tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(needle) ||
      (task.notes?.toLowerCase().includes(needle) ?? false),
  )
}

/** The field the Completed view orders by. */
export type TaskCompletionInput = {
  completedAt: Date | null
}

/**
 * Most recently completed first.
 *
 * `getTasks` orders by `sort_order` then due date, which is the right order for open work and
 * a meaningless one for finished work — it put the thing you just ticked anywhere in the
 * list. A Completed view is a history, and a history reads newest first.
 *
 * **Nulls sort LAST.** `completed_at` is nullable, so a row finished before that column was
 * written has no instant to place; the bottom is the honest place for it rather than the top,
 * which is where an ascending-null sort would put it.
 *
 * Copies before sorting. It is handed an array derived from a React prop, and sorting in
 * place would be a side effect on data the caller still holds.
 */
export function sortByCompletion<T extends TaskCompletionInput>(
  tasks: T[],
): T[] {
  return [...tasks].sort((a, b) => {
    if (!a.completedAt) return b.completedAt ? 1 : 0
    if (!b.completedAt) return -1
    return b.completedAt.getTime() - a.completedAt.getTime()
  })
}
