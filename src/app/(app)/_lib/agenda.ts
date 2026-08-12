// Pure agenda assembly for the dashboard: today's due tasks and today's event
// occurrences merged into one chronological list. Dependency-free (no DB, no
// `server-only`) so it unit-tests directly, and timezone-sensitive input is explicit
// (`now` + IANA zone) for determinism — same conventions as todos/service.ts.

import { dueStatus } from "@/lib/date"

/** The only fields the agenda reads off a task; callers pass their richer rows. */
export type AgendaTask = {
  dueDate: string | null
  status: "open" | "done"
  /** Set when a routine run created this task — see `tasks.routine_id`. */
  routineId?: string | null
}

/** An expanded calendar occurrence. `time` is "HH:MM" local, or null for all-day. */
export type AgendaOccurrence = { time: string | null }

export type AgendaItem<T, E> =
  | { kind: "task"; time: null; task: T }
  | { kind: "event"; time: string | null; occurrence: E }

/** Due-today tasks that one routine run put on the board, kept together. */
export type AgendaGroup<T> = {
  routineId: string
  name: string
  tasks: T[]
}

export type TodayAgenda<T, E> = {
  /** Open tasks due before today. Rendered as their own block above the agenda —
   * they demand attention today but have no time-of-day to sort by. */
  overdue: T[]
  /**
   * Due-today tasks created by a routine, one block per routine, in the order their
   * first task appears.
   *
   * Pulled OUT of `items` rather than tagged inside it. A routine is a sequence — the
   * point of grouping is that its steps stay contiguous — and leaving them in the time
   * sort would let a loose task land in the middle of one and undo that.
   */
  groups: AgendaGroup<T>[]
  /** Today, in display order: all-day events, then loose due-today tasks, then timed
   * events ascending. Routine tasks are in `groups` instead. */
  items: AgendaItem<T, E>[]
}

/**
 * Build the dashboard's agenda.
 *
 * `occurrences` are expected to be a single day's — hand it `getDayEvents(today, tz)`,
 * which has already expanded recurrence and applied per-occurrence exceptions.
 *
 * `routineNames` resolves `task.routineId` to a heading. A task whose routine is not in
 * the map falls back to the loose list rather than forming a nameless block: the FK sets
 * `routine_id` to null when a routine is deleted, so this is a defensive path, and an
 * ungrouped task is exactly the pre-grouping behaviour.
 */
export function buildTodayAgenda<
  T extends AgendaTask,
  E extends AgendaOccurrence,
>(
  tasks: T[],
  occurrences: E[],
  now: Date,
  timeZone: string,
  routineNames: ReadonlyMap<string, string> = new Map(),
): TodayAgenda<T, E> {
  const overdue: T[] = []
  const loose: T[] = []
  // Insertion-ordered, which is what puts the groups in the order their first task
  // appears rather than in an arbitrary or alphabetical one. The name is carried in the
  // bucket so the map lookup happens once per task and never needs re-asserting later.
  const grouped = new Map<string, AgendaGroup<T>>()

  for (const task of tasks) {
    if (task.status !== "open") continue
    const status = dueStatus(task.dueDate, now, timeZone)
    if (status === "overdue") {
      overdue.push(task)
      continue
    }
    if (status !== "due-today") continue

    const name = task.routineId ? routineNames.get(task.routineId) : undefined
    if (
      task.routineId === undefined ||
      task.routineId === null ||
      name === undefined
    ) {
      loose.push(task)
      continue
    }

    const bucket = grouped.get(task.routineId)
    if (bucket) bucket.tasks.push(task)
    else
      grouped.set(task.routineId, {
        routineId: task.routineId,
        name,
        tasks: [task],
      })
  }

  const groups: AgendaGroup<T>[] = [...grouped.values()]

  const items: AgendaItem<T, E>[] = [
    // Events are listed before tasks so that, under a stable sort, all-day events
    // lead the untimed block and tasks follow.
    ...occurrences.map((occurrence) => ({
      kind: "event" as const,
      time: occurrence.time,
      occurrence,
    })),
    ...loose.map((task) => ({ kind: "task" as const, time: null, task })),
  ]

  // "" sorts before any "HH:MM", so untimed items lead; Array.prototype.sort is stable
  // (ES2019+), which is what makes the within-bucket order deterministic.
  items.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))

  return { overdue, groups, items }
}
