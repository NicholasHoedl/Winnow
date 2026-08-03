import "server-only"
import { and, asc, desc, eq, ne } from "drizzle-orm"

import { db } from "@/db"
import { todayInZone } from "@/lib/date"
import { currentCycle } from "@/lib/recurrence"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"

import {
  lists,
  subtasks,
  taskRecurrenceExceptions,
  taskRecurrences,
  tasks,
} from "./schema"
import { summarizeTasks } from "./service"

export type Task = typeof tasks.$inferSelect
export type List = typeof lists.$inferSelect
// The rule behind a generated instance (userId dropped — never sent to the client). Used
// to badge recurring instances and to prefill the "Series" editor.
export type TaskSeries = Omit<typeof taskRecurrences.$inferSelect, "userId">
export type Subtask = typeof subtasks.$inferSelect
export type TaskWithSeries = Task & {
  series: TaskSeries | null
  subtasks: Subtask[]
}

/** Skipped cycles, keyed `ruleId::occurrenceDate` — see {@link loadSkipped}. */
export type SkippedCycles = ReadonlySet<string>

const cycleKey = (ruleId: string, occurrenceDate: string) =>
  `${ruleId}::${occurrenceDate}`

/**
 * Every skipped cycle for a user, in ONE query.
 *
 * Batched deliberately. `ensureRecurringTasks` already loops rules sequentially, and it
 * runs on every render of /todos, the dashboard and the digest — a per-rule lookup
 * would double the query count on the app's hottest path. Pass `ruleId` only for the
 * single-rule callers (createTaskRecurrence / updateTaskRecurrence), which sync one rule
 * and shouldn't scan the rest.
 */
async function loadSkipped(
  userId: string,
  ruleId?: string,
): Promise<SkippedCycles> {
  const rows = await db.query.taskRecurrenceExceptions.findMany({
    where: ruleId
      ? and(
          eq(taskRecurrenceExceptions.userId, userId),
          eq(taskRecurrenceExceptions.ruleId, ruleId),
        )
      : eq(taskRecurrenceExceptions.userId, userId),
    columns: { ruleId: true, occurrenceDate: true },
  })
  return new Set(rows.map((row) => cycleKey(row.ruleId, row.occurrenceDate)))
}

// Sync ONE rule's instances to its current cycle: retire off-cycle OPEN instances and
// ensure the current one exists. `overwriteContent` propagates a series edit onto the
// current instance (updateTaskRecurrence); the lazy generator leaves existing instances
// alone so per-instance ("This task") edits and done-state survive. Completed instances
// are never retired (history) and their cycle is never re-created.
export async function syncRuleInstances(
  userId: string,
  rule: typeof taskRecurrences.$inferSelect,
  today: string,
  weekStartsOn: number,
  overwriteContent = false,
  skipped?: SkippedCycles,
): Promise<void> {
  const cycle = currentCycle(rule, today, weekStartsOn)

  // "Skip this one". Deleting the instance is NOT a skip — this generator runs on every
  // render of /todos, the dashboard and the digest, so the row would be back
  // before the page finished loading. The exception has to suppress the INSERT.
  const isSkipped = cycle
    ? (skipped ?? (await loadSkipped(userId, rule.id))).has(
        cycleKey(rule.id, cycle.occurrenceDate),
      )
    : false

  const stale = [
    eq(tasks.userId, userId),
    eq(tasks.seriesId, rule.id),
    eq(tasks.status, "open"),
  ]
  // Omitting the `ne` when skipped is what removes the CURRENT open instance too —
  // otherwise the skip would only take effect on the next cycle.
  if (cycle && !isSkipped)
    stale.push(ne(tasks.occurrenceDate, cycle.occurrenceDate))
  await db.delete(tasks).where(and(...stale))
  if (!cycle || isSkipped) return

  const content = {
    title: rule.title,
    notes: rule.notes,
    priority: rule.priority,
    listId: rule.listId,
    dueDate: cycle.date,
  }
  const insert = db.insert(tasks).values({
    userId,
    seriesId: rule.id,
    occurrenceDate: cycle.occurrenceDate,
    status: "open",
    ...content,
  })
  // Idempotent under concurrency via the (series_id, occurrence_date) unique constraint.
  await (overwriteContent
    ? insert.onConflictDoUpdate({
        target: [tasks.seriesId, tasks.occurrenceDate],
        set: { ...content, updatedAt: new Date() },
      })
    : insert.onConflictDoNothing({
        target: [tasks.seriesId, tasks.occurrenceDate],
      }))
}

// Lazy, idempotent materializer (mirrors ensureDefaultCalendars in calendar/queries).
// Runs inside the task reads below so recurring instances appear without a cron job.
async function ensureRecurringTasks(
  userId: string,
  today: string,
  weekStartsOn: number,
): Promise<void> {
  // One exceptions query for the whole user, handed to every rule below. Loading them
  // per-rule would double this loop's query count on the app's hottest path.
  const [rules, skipped] = await Promise.all([
    db.query.taskRecurrences.findMany({
      where: eq(taskRecurrences.userId, userId),
    }),
    loadSkipped(userId),
  ])
  for (const rule of rules) {
    await syncRuleInstances(userId, rule, today, weekStartsOn, false, skipped)
  }
}

export async function getLists(): Promise<List[]> {
  const userId = await requireUserId()
  return db.query.lists.findMany({
    where: eq(lists.userId, userId),
    orderBy: [asc(lists.sortOrder), asc(lists.createdAt)],
  })
}

export async function getTasks(): Promise<TaskWithSeries[]> {
  const userId = await requireUserId()
  const { timeZone, weekStartsOn } = await getUserPreferences()
  await ensureRecurringTasks(
    userId,
    todayInZone(new Date(), timeZone),
    weekStartsOn,
  )

  // Postgres sorts NULLs last for ASC by default, so undated tasks fall to the bottom.
  const [taskRows, ruleRows, subtaskRows] = await Promise.all([
    db.query.tasks.findMany({
      where: eq(tasks.userId, userId),
      // sortOrder first so a manual drag wins; dueDate/createdAt remain the tiebreak,
      // which is what every existing row (all sortOrder 0) still sorts by.
      orderBy: [
        asc(tasks.sortOrder),
        asc(tasks.dueDate),
        desc(tasks.createdAt),
      ],
    }),
    db.query.taskRecurrences.findMany({
      where: eq(taskRecurrences.userId, userId),
      columns: { userId: false },
    }),
    // One extra read grouped in memory, not a per-row join — the same shape getGoals
    // uses for milestones. A single user's checklists are small.
    db.query.subtasks.findMany({
      where: eq(subtasks.userId, userId),
      orderBy: [asc(subtasks.sortOrder), asc(subtasks.createdAt)],
    }),
  ])

  const seriesById = new Map(ruleRows.map((r) => [r.id, r]))
  const subtasksByTask = new Map<string, Subtask[]>()
  for (const row of subtaskRows) {
    const list = subtasksByTask.get(row.taskId)
    if (list) list.push(row)
    else subtasksByTask.set(row.taskId, [row])
  }
  return taskRows.map((task) => ({
    ...task,
    series: task.seriesId ? (seriesById.get(task.seriesId) ?? null) : null,
    subtasks: subtasksByTask.get(task.id) ?? [],
  }))
}

/**
 * Every recurrence rule, independent of whether it currently has a materialized instance.
 *
 * That independence is the point. Both routes to a rule — "Stop repeating" and the series
 * editor — hang off a generated task row, so a rule with no current instance was
 * unreachable: nothing to click until the next cycle appeared. Two ways to land there, one
 * of them pre-existing — a rule whose `startDate` is in the future has never generated
 * anything, and (since T5a) skipping the current cycle removes the only row there was.
 */
export async function getTaskRecurrences(): Promise<TaskSeries[]> {
  const userId = await requireUserId()
  return db.query.taskRecurrences.findMany({
    where: eq(taskRecurrences.userId, userId),
    columns: { userId: false },
    orderBy: [asc(taskRecurrences.title)],
  })
}

export async function getTaskSummary(timeZone: string) {
  const userId = await requireUserId()
  const { weekStartsOn } = await getUserPreferences()
  await ensureRecurringTasks(
    userId,
    todayInZone(new Date(), timeZone),
    weekStartsOn,
  )

  const rows = await db.query.tasks.findMany({
    where: eq(tasks.userId, userId),
    columns: { id: true, title: true, dueDate: true, status: true },
  })
  return summarizeTasks(rows, new Date(), timeZone)
}
