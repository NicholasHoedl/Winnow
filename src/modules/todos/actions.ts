"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { type ActionResult, invalid, nullify } from "@/lib/action-result"
import { todayInZone } from "@/lib/date"
import { revalidateHubs } from "@/lib/revalidate"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"

import { syncRuleInstances, type Task } from "./queries"
import { lists, taskRecurrences, tasks } from "./schema"
import {
  listInputSchema,
  taskInputSchema,
  taskRecurrenceSchema,
} from "./validation"

/**
 * The row id every single-item delete takes. A Server Action is a public RPC endpoint, so
 * `id: string` is a compile-time annotation and nothing more — anything can be posted. A
 * non-uuid reaches Postgres as a comparison against a `uuid` column and throws
 * `invalid input syntax for type uuid`, which surfaces as an error boundary instead of a
 * clean rejection. Ownership is enforced separately, by the userId in every where clause.
 */
const idSchema = z.string().uuid()

// Every surface that renders task data: the todos page, the two hubs, and — since a
// task can be linked to a goal (T2) — the goals page, which lists a goal's tasks.
function revalidateTaskViews(): void {
  revalidatePath("/todos")
  revalidatePath("/goals")
  revalidateHubs()
}

// --- Tasks ---

export async function createTask(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = taskInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, dueDate, priority, listId, goalId, eventId } =
    parsed.data
  await db.insert(tasks).values({
    userId,
    title,
    notes: nullify(notes),
    dueDate: nullify(dueDate),
    priority,
    listId: nullify(listId),
    goalId: nullify(goalId),
    eventId: nullify(eventId),
  })

  revalidateTaskViews()
  return { ok: true }
}

export async function updateTask(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = taskInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, dueDate, priority, listId, goalId, eventId } =
    parsed.data
  await db
    .update(tasks)
    .set({
      title,
      notes: nullify(notes),
      dueDate: nullify(dueDate),
      priority,
      listId: nullify(listId),
      goalId: nullify(goalId),
      eventId: nullify(eventId),
    })
    .where(and(eq(tasks.id, parsedId.data), eq(tasks.userId, userId)))

  revalidateTaskViews()
  return { ok: true }
}

export type DeleteTaskResult =
  { ok: true; task: Task | null } | { ok: false; error: string }

export async function deleteTask(id: unknown): Promise<DeleteTaskResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  const [deleted] = await db
    .delete(tasks)
    .where(and(eq(tasks.id, parsed.data), eq(tasks.userId, userId)))
    .returning()
  revalidateTaskViews()
  return { ok: true, task: deleted ?? null }
}

/** Re-inserts a task removed via {@link deleteTask} (the "undo" path). The user
 * id is always taken from the session — any client-supplied one is ignored. */
export async function restoreTask(task: Task): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .insert(tasks)
    .values({
      id: task.id,
      userId,
      // Restore every column so undo is faithful — including listId (previously
      // dropped) and the T2 goal/event links.
      listId: task.listId,
      seriesId: task.seriesId,
      occurrenceDate: task.occurrenceDate,
      goalId: task.goalId,
      eventId: task.eventId,
      title: task.title,
      notes: task.notes,
      dueDate: task.dueDate,
      priority: task.priority,
      status: task.status,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
    })
    .onConflictDoNothing()
  revalidateTaskViews()
  return { ok: true }
}

export async function toggleTaskStatus(id: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, parsed.data), eq(tasks.userId, userId)),
    columns: { status: true },
  })
  if (!task) return { ok: false, error: "Task not found." }

  const nextStatus = task.status === "open" ? "done" : "open"
  await db
    .update(tasks)
    .set({
      status: nextStatus,
      completedAt: nextStatus === "done" ? new Date() : null,
    })
    .where(and(eq(tasks.id, parsed.data), eq(tasks.userId, userId)))

  revalidateTaskViews()
  return { ok: true }
}

// --- Recurring tasks ---

// The rule columns shared by create + update, from validated input.
function ruleColumns(d: z.infer<typeof taskRecurrenceSchema>) {
  return {
    title: d.title,
    notes: nullify(d.notes),
    priority: d.priority,
    listId: nullify(d.listId),
    freq: d.freq,
    recurrenceInterval: d.recurrenceInterval,
    weekdays: d.weekdays,
    monthlyMode: d.monthlyMode,
    flexible: d.flexible,
    startDate: d.startDate,
    endDate: nullify(d.endDate),
  }
}

export async function createTaskRecurrence(
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = taskRecurrenceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const [rule] = await db
    .insert(taskRecurrences)
    .values({ userId, ...ruleColumns(parsed.data) })
    .returning()
  // Materialize the current instance immediately (revalidation would regenerate it too).
  const { timeZone, weekStartsOn } = await getUserPreferences()
  await syncRuleInstances(
    userId,
    rule,
    todayInZone(new Date(), timeZone),
    weekStartsOn,
  )

  revalidateTaskViews()
  return { ok: true }
}

export async function updateTaskRecurrence(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = taskRecurrenceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const [rule] = await db
    .update(taskRecurrences)
    .set(ruleColumns(parsed.data))
    .where(
      and(
        eq(taskRecurrences.id, parsedId.data),
        eq(taskRecurrences.userId, userId),
      ),
    )
    .returning()
  if (!rule) return { ok: false, error: "Recurring task not found." }

  // Re-sync: move/retire the current instance and propagate the edited content onto it.
  const { timeZone, weekStartsOn } = await getUserPreferences()
  await syncRuleInstances(
    userId,
    rule,
    todayInZone(new Date(), timeZone),
    weekStartsOn,
    true,
  )

  revalidateTaskViews()
  return { ok: true }
}

export async function deleteTaskRecurrence(id: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  // Delete OPEN instances first (while the FK is set); deleting the rule then detaches
  // any COMPLETED instances into standalone history (series_id ON DELETE SET NULL).
  await db
    .delete(tasks)
    .where(
      and(
        eq(tasks.seriesId, parsed.data),
        eq(tasks.userId, userId),
        eq(tasks.status, "open"),
      ),
    )
  await db
    .delete(taskRecurrences)
    .where(
      and(
        eq(taskRecurrences.id, parsed.data),
        eq(taskRecurrences.userId, userId),
      ),
    )

  revalidateTaskViews()
  return { ok: true }
}

// --- Lists ---

export async function createList(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = listInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db.insert(lists).values({ userId, name: parsed.data.name })
  revalidatePath("/todos")
  return { ok: true }
}

export async function renameList(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = listInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .update(lists)
    .set({ name: parsed.data.name })
    .where(and(eq(lists.id, parsedId.data), eq(lists.userId, userId)))
  revalidatePath("/todos")
  return { ok: true }
}

export async function deleteList(id: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  // Tasks in this list have list_id set to NULL (FK onDelete: set null).
  await db
    .delete(lists)
    .where(and(eq(lists.id, parsed.data), eq(lists.userId, userId)))
  revalidatePath("/todos")
  return { ok: true }
}
