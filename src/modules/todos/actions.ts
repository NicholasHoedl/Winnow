"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { type ActionResult, invalid, nullify } from "@/lib/action-result"
import { todayInZone } from "@/lib/date"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"

import { syncRuleInstances, type Task } from "./queries"
import { lists, taskRecurrences, tasks } from "./schema"
import {
  listInputSchema,
  taskInputSchema,
  taskRecurrenceSchema,
} from "./validation"

// --- Tasks ---

export async function createTask(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = taskInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, dueDate, priority, listId } = parsed.data
  await db.insert(tasks).values({
    userId,
    title,
    notes: nullify(notes),
    dueDate: nullify(dueDate),
    priority,
    listId: nullify(listId),
  })

  revalidatePath("/todos")
  revalidatePath("/")
  return { ok: true }
}

export async function updateTask(id: string, input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = taskInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, dueDate, priority, listId } = parsed.data
  await db
    .update(tasks)
    .set({
      title,
      notes: nullify(notes),
      dueDate: nullify(dueDate),
      priority,
      listId: nullify(listId),
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))

  revalidatePath("/todos")
  revalidatePath("/")
  return { ok: true }
}

export type DeleteTaskResult =
  | { ok: true; task: Task | null }
  | { ok: false; error: string }

export async function deleteTask(id: string): Promise<DeleteTaskResult> {
  const userId = await requireUserId()
  const [deleted] = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning()
  revalidatePath("/todos")
  revalidatePath("/")
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
      seriesId: task.seriesId,
      occurrenceDate: task.occurrenceDate,
      title: task.title,
      notes: task.notes,
      dueDate: task.dueDate,
      priority: task.priority,
      status: task.status,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
    })
    .onConflictDoNothing()
  revalidatePath("/todos")
  revalidatePath("/")
  return { ok: true }
}

export async function toggleTaskStatus(id: string): Promise<ActionResult> {
  const userId = await requireUserId()
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, id), eq(tasks.userId, userId)),
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
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))

  revalidatePath("/todos")
  revalidatePath("/")
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
  await syncRuleInstances(userId, rule, todayInZone(new Date(), timeZone), weekStartsOn)

  revalidatePath("/todos")
  revalidatePath("/")
  return { ok: true }
}

export async function updateTaskRecurrence(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = taskRecurrenceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const [rule] = await db
    .update(taskRecurrences)
    .set(ruleColumns(parsed.data))
    .where(and(eq(taskRecurrences.id, id), eq(taskRecurrences.userId, userId)))
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

  revalidatePath("/todos")
  revalidatePath("/")
  return { ok: true }
}

export async function deleteTaskRecurrence(id: string): Promise<ActionResult> {
  const userId = await requireUserId()
  // Delete OPEN instances first (while the FK is set); deleting the rule then detaches
  // any COMPLETED instances into standalone history (series_id ON DELETE SET NULL).
  await db
    .delete(tasks)
    .where(
      and(
        eq(tasks.seriesId, id),
        eq(tasks.userId, userId),
        eq(tasks.status, "open"),
      ),
    )
  await db
    .delete(taskRecurrences)
    .where(and(eq(taskRecurrences.id, id), eq(taskRecurrences.userId, userId)))

  revalidatePath("/todos")
  revalidatePath("/")
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

export async function renameList(id: string, input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = listInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .update(lists)
    .set({ name: parsed.data.name })
    .where(and(eq(lists.id, id), eq(lists.userId, userId)))
  revalidatePath("/todos")
  return { ok: true }
}

export async function deleteList(id: string): Promise<ActionResult> {
  const userId = await requireUserId()
  // Tasks in this list have list_id set to NULL (FK onDelete: set null).
  await db.delete(lists).where(and(eq(lists.id, id), eq(lists.userId, userId)))
  revalidatePath("/todos")
  return { ok: true }
}
