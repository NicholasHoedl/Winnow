import "server-only"
import { and, asc, desc, eq, ne } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"

import { lists, taskRecurrences, tasks } from "./schema"
import { currentCycle } from "./recurrence"
import { summarizeTasks, todayInZone } from "./service"

export type Task = typeof tasks.$inferSelect
export type List = typeof lists.$inferSelect
// The rule behind a generated instance (userId dropped — never sent to the client). Used
// to badge recurring instances and to prefill the "Series" editor.
export type TaskSeries = Omit<typeof taskRecurrences.$inferSelect, "userId">
export type TaskWithSeries = Task & { series: TaskSeries | null }

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
): Promise<void> {
  const cycle = currentCycle(rule, today, weekStartsOn)
  const stale = [
    eq(tasks.userId, userId),
    eq(tasks.seriesId, rule.id),
    eq(tasks.status, "open"),
  ]
  if (cycle) stale.push(ne(tasks.occurrenceDate, cycle.occurrenceDate))
  await db.delete(tasks).where(and(...stale))
  if (!cycle) return

  const content = {
    title: rule.title,
    notes: rule.notes,
    priority: rule.priority,
    listId: rule.listId,
    dueDate: cycle.dueDate,
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
    : insert.onConflictDoNothing({ target: [tasks.seriesId, tasks.occurrenceDate] }))
}

// Lazy, idempotent materializer (mirrors ensureDefaultCalendars in calendar/queries).
// Runs inside the task reads below so recurring instances appear without a cron job.
async function ensureRecurringTasks(
  userId: string,
  today: string,
  weekStartsOn: number,
): Promise<void> {
  const rules = await db.query.taskRecurrences.findMany({
    where: eq(taskRecurrences.userId, userId),
  })
  for (const rule of rules) {
    await syncRuleInstances(userId, rule, today, weekStartsOn)
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
  await ensureRecurringTasks(userId, todayInZone(new Date(), timeZone), weekStartsOn)

  // Postgres sorts NULLs last for ASC by default, so undated tasks fall to the bottom.
  const [taskRows, ruleRows] = await Promise.all([
    db.query.tasks.findMany({
      where: eq(tasks.userId, userId),
      orderBy: [asc(tasks.dueDate), desc(tasks.createdAt)],
    }),
    db.query.taskRecurrences.findMany({
      where: eq(taskRecurrences.userId, userId),
      columns: { userId: false },
    }),
  ])

  const seriesById = new Map(ruleRows.map((r) => [r.id, r]))
  return taskRows.map((task) => ({
    ...task,
    series: task.seriesId ? (seriesById.get(task.seriesId) ?? null) : null,
  }))
}

export async function getTaskSummary(timeZone: string) {
  const userId = await requireUserId()
  const { weekStartsOn } = await getUserPreferences()
  await ensureRecurringTasks(userId, todayInZone(new Date(), timeZone), weekStartsOn)

  const rows = await db.query.tasks.findMany({
    where: eq(tasks.userId, userId),
    columns: { id: true, title: true, dueDate: true, status: true },
  })
  return summarizeTasks(rows, new Date(), timeZone)
}
