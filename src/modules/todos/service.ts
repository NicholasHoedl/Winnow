// Pure, dependency-free to-do logic. No DB, no `server-only` — so it can be
// unit-tested directly. All timezone-sensitive functions take an explicit
// `now` and IANA `timeZone` for determinism.

export type DueStatus = "overdue" | "due-today" | "upcoming" | "none"

/** Wall-date (YYYY-MM-DD) for an instant in a given IANA timezone. */
export function todayInZone(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

/**
 * Classify a date-only due date relative to "today" in the given timezone.
 * ISO date strings compare lexicographically == chronologically, so no date
 * arithmetic (and thus no DST hazard) is involved.
 */
export function dueStatus(
  dueDate: string | null | undefined,
  now: Date,
  timeZone: string,
): DueStatus {
  if (!dueDate) return "none"
  const today = todayInZone(now, timeZone)
  if (dueDate < today) return "overdue"
  if (dueDate === today) return "due-today"
  return "upcoming"
}

export type TaskSummaryInput = { dueDate: string | null; status: "open" | "done" }

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

/** True if `value` is a real calendar date in 'YYYY-MM-DD' form (rejects
 * overflow like month 13 / Feb 30 that a bare regex would accept). */
export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}
