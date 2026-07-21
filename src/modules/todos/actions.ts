"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"

import { lists, tasks } from "./schema"
import { listInputSchema, taskInputSchema } from "./validation"

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "")
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

/** Empty strings from form inputs become NULL in the DB. */
function nullify(value: string | null | undefined): string | null {
  return value == null || value === "" ? null : value
}

function invalid(error: z.ZodError): ActionResult {
  return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(error) }
}

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

export async function deleteTask(id: string): Promise<ActionResult> {
  const userId = await requireUserId()
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
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
