import "server-only"
import { cache } from "react"
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  ne,
} from "drizzle-orm"

import { db } from "@/db"
import { addDays, todayInZone } from "@/lib/date"
import { currentCycle } from "@/lib/recurrence"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"
// A queries file reading another module's schema, which is the same direction
// `goals/queries.ts` reads `habits/schema.ts`. Safe: no schema file imports this one, so
// the eager-`priorityEnum` cycle described in HANDOFF §4 is not in play here.
import { routines } from "@/modules/routines/schema"

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
//
// `cache()` because the dashboard calls getTasks() and getTaskSummary() in the same render,
// and each awaited this — so the whole 2N delete/insert loop ran twice for no new rows.
// Keyed on all three arguments, which is the right key: they are derived from the same
// preferences within a request, so a second call inside one render always matches.
const ensureRecurringTasks = cache(
  async (
    userId: string,
    today: string,
    weekStartsOn: number,
  ): Promise<void> => {
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
  },
)

/**
 * Delete the unfinished tasks of routines set to `drop`, once their day has passed.
 *
 * Lazy-on-read, beside `ensureRecurringTasks` and for the same reason: this app has no
 * scheduler, page rendering is the scheduler (ADR-0004). So the sweep runs wherever tasks
 * are read, which is every surface that could have shown the row.
 *
 * **This DELETES user data with no undo, so read the boundaries as load-bearing rather
 * than defensive.** All five must hold, and each excludes something it would be a bug to
 * take:
 *
 * - `routine_id` is in the drop set — a task nobody's routine created has a NULL here, and
 *   `NULL IN (…)` is NULL, never true, so hand-written tasks cannot match by accident.
 * - the routine is the CALLER'S and is set to `drop` — the subquery is user-scoped too, so
 *   a stranger's `drop` routine cannot reach into this account's rows.
 * - `status = 'open'` — a completed task is history. Deleting it would rewrite what you did.
 * - `due_date IS NOT NULL` — a routine item with a null offset makes a task with no due
 *   date, which has no day to be past. Without this, `NULL < today` would be NULL and
 *   exclude it anyway, but relying on that is a footgun for the next person.
 * - `due_date < today` in the USER'S zone — never today's work, never the future.
 *
 * `cache()` for the same reason `ensureRecurringTasks` has it: the dashboard reads tasks
 * twice in one render, and this would otherwise issue the delete twice.
 */
const dropExpiredRoutineTasks = cache(
  async (userId: string, today: string): Promise<void> => {
    await db.delete(tasks).where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, "open"),
        isNotNull(tasks.dueDate),
        lt(tasks.dueDate, today),
        inArray(
          tasks.routineId,
          db
            .select({ id: routines.id })
            .from(routines)
            .where(
              and(
                eq(routines.userId, userId),
                eq(routines.onUnfinished, "drop"),
              ),
            ),
        ),
      ),
    )
  },
)

/** `cache()`: the app shell's always-mounted task dialog and the page both need the lists. */
/** A ceiling for the same reason `getGoalOptions` has one — see the note there. */
const LIST_CAP = 500

export const getLists = cache(async (): Promise<List[]> => {
  const userId = await requireUserId()
  return db.query.lists.findMany({
    where: eq(lists.userId, userId),
    orderBy: [asc(lists.sortOrder), asc(lists.createdAt)],
    limit: LIST_CAP,
  })
})

export async function getTasks(): Promise<TaskWithSeries[]> {
  const userId = await requireUserId()
  const { timeZone, weekStartsOn } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  // Both lazy-on-read, and deliberately in this order: the sweep clears yesterday's
  // dropped routine work before the generator materializes today's, so a row can never be
  // created and removed inside one render. They touch disjoint sets anyway — a recurring
  // instance carries `seriesId`, a routine's task carries `routineId`, and `runRoutine`
  // sets neither of the other's — but the order makes that easy to keep true.
  await dropExpiredRoutineTasks(userId, today)
  await ensureRecurringTasks(userId, today, weekStartsOn)

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

export type CompletedTask = {
  id: string
  title: string
  completedOn: string
  /** Null for most tasks. Lets the weekly review attribute work to a goal (T8). */
  goalId: string | null
}

/**
 * Tasks completed on a local date within [start, end], inclusive.
 *
 * `completedAt` is a timestamptz — the one date in this module that is an INSTANT rather
 * than a wall-date. Which local day it belongs to depends on the user's zone, so it
 * cannot be expressed in the where clause at all. The query bounds it generously in UTC
 * and the exact membership test happens in JS through the same `todayInZone` every other
 * surface uses, rather than a hand-rolled offset.
 */
export async function getCompletedInRange(
  start: string,
  end: string,
  timeZone: string,
): Promise<CompletedTask[]> {
  const userId = await requireUserId()
  // A day of slack on each side covers every UTC offset; the real test is below.
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, userId),
      eq(tasks.status, "done"),
      isNotNull(tasks.completedAt),
      gte(tasks.completedAt, new Date(`${addDays(start, -1)}T00:00:00Z`)),
      lt(tasks.completedAt, new Date(`${addDays(end, 2)}T00:00:00Z`)),
    ),
    columns: { id: true, title: true, completedAt: true, goalId: true },
    orderBy: [asc(tasks.completedAt)],
  })
  return rows.flatMap((row) => {
    if (!row.completedAt) return []
    const completedOn = todayInZone(row.completedAt, timeZone)
    if (completedOn < start || completedOn > end) return []
    return [{ id: row.id, title: row.title, completedOn, goalId: row.goalId }]
  })
}
