// Pure agenda assembly for the dashboard: today's due tasks and today's event
// occurrences merged into one chronological list. Dependency-free (no DB, no
// `server-only`) so it unit-tests directly, and timezone-sensitive input is explicit
// (`now` + IANA zone) for determinism — same conventions as todos/service.ts.

import { dueStatus } from "@/lib/date"

/** The only fields the agenda reads off a task; callers pass their richer rows. */
export type AgendaTask = { dueDate: string | null; status: "open" | "done" }

/** An expanded calendar occurrence. `time` is "HH:MM" local, or null for all-day. */
export type AgendaOccurrence = { time: string | null }

export type AgendaItem<T, E> =
  | { kind: "task"; time: null; task: T }
  | { kind: "event"; time: string | null; occurrence: E }

export type TodayAgenda<T, E> = {
  /** Open tasks due before today. Rendered as their own block above the agenda —
   * they demand attention today but have no time-of-day to sort by. */
  overdue: T[]
  /** Today, in display order: all-day events, then due-today tasks, then timed
   * events ascending. */
  items: AgendaItem<T, E>[]
}

/**
 * Build the dashboard's agenda.
 *
 * `occurrences` are expected to be a single day's — hand it `getDayEvents(today, tz)`,
 * which has already expanded recurrence and applied per-occurrence exceptions.
 */
export function buildTodayAgenda<
  T extends AgendaTask,
  E extends AgendaOccurrence,
>(
  tasks: T[],
  occurrences: E[],
  now: Date,
  timeZone: string,
): TodayAgenda<T, E> {
  const overdue: T[] = []
  const dueToday: T[] = []
  for (const task of tasks) {
    if (task.status !== "open") continue
    const status = dueStatus(task.dueDate, now, timeZone)
    if (status === "overdue") overdue.push(task)
    else if (status === "due-today") dueToday.push(task)
  }

  const items: AgendaItem<T, E>[] = [
    // Events are listed before tasks so that, under a stable sort, all-day events
    // lead the untimed block and tasks follow.
    ...occurrences.map((occurrence) => ({
      kind: "event" as const,
      time: occurrence.time,
      occurrence,
    })),
    ...dueToday.map((task) => ({ kind: "task" as const, time: null, task })),
  ]

  // "" sorts before any "HH:MM", so untimed items lead; Array.prototype.sort is stable
  // (ES2019+), which is what makes the within-bucket order deterministic.
  items.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))

  return { overdue, items }
}
