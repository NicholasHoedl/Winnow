"use server"

import { revalidatePath } from "next/cache"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import {
  type ActionFailure,
  type ActionResult,
  invalid,
  nullify,
} from "@/lib/action-result"
import { revalidateHubs } from "@/lib/revalidate"
import { requireUserId } from "@/lib/session"
import { tasks } from "@/modules/todos/schema"

import type { RoutineItemRow } from "./queries"
import { restorableRoutineItem } from "./restore"
import { routineItems, routines } from "./schema"
import { previewRun } from "./service"
import {
  restoreRoutineItemSchema,
  routineInputSchema,
  routineItemInputSchema,
  runRoutineSchema,
} from "./validation"

/** See goals/actions.ts — every id crossing an RPC boundary is parsed, not annotated. */
const idSchema = z.string().uuid()

// Editing a routine only changes the manager page.
function revalidateRoutines() {
  revalidatePath("/activity/routines")
}

// Running one creates real tasks, so the list and the hubs change too.
function revalidateRunEffects() {
  revalidatePath("/activity/routines")
  revalidatePath("/activity")
  revalidateHubs()
}

// --- Routines ---

/**
 * Carries the new routine's id, because one caller needs it: the companion applies a
 * generated routine by creating it and then appending its items, and `addRoutineItem`
 * takes a routine id. A wider success branch rather than a second insert path — the same
 * shape `DeleteTaskResult` uses to carry an undo payload, and existing callers that only
 * read `.ok` are unaffected.
 */
export type CreateRoutineResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export async function createRoutine(
  input: unknown,
): Promise<CreateRoutineResult> {
  const userId = await requireUserId()
  const parsed = routineInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const [created] = await db
    .insert(routines)
    .values({
      userId,
      name: parsed.data.name,
      description: nullify(parsed.data.description),
    })
    .returning({ id: routines.id })
  revalidateRoutines()
  return { ok: true, id: created.id }
}

export async function updateRoutine(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = routineInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .update(routines)
    .set({
      name: parsed.data.name,
      description: nullify(parsed.data.description),
    })
    .where(and(eq(routines.id, parsedId.data), eq(routines.userId, userId)))
  revalidateRoutines()
  return { ok: true }
}

export async function deleteRoutine(id: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  // Items cascade. Tasks already spun up are untouched by design — they are real work
  // that happens to have come from a template, not part of it.
  await db
    .delete(routines)
    .where(and(eq(routines.id, parsed.data), eq(routines.userId, userId)))
  revalidateRoutines()
  return { ok: true }
}

// --- Items ---

export async function addRoutineItem(
  routineId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(routineId)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = routineItemInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  // Ownership: the routine must be the caller's, or this appends into someone else's.
  const [owned] = await db
    .select({ id: routines.id })
    .from(routines)
    .where(and(eq(routines.id, parsedId.data), eq(routines.userId, userId)))
    .limit(1)
  if (!owned) return { ok: false, error: "Unknown routine." }

  // Append rather than leaving sortOrder at its default, so the order the items were
  // added in is the order they run in.
  const [last] = await db
    .select({ sortOrder: routineItems.sortOrder })
    .from(routineItems)
    .where(
      and(
        eq(routineItems.userId, userId),
        eq(routineItems.routineId, parsedId.data),
      ),
    )
    .orderBy(desc(routineItems.sortOrder))
    .limit(1)

  await db.insert(routineItems).values({
    userId,
    routineId: parsedId.data,
    title: parsed.data.title,
    notes: nullify(parsed.data.notes),
    dueOffsetDays: parsed.data.dueOffsetDays ?? null,
    priority: parsed.data.priority ?? "medium",
    listId: parsed.data.listId ?? null,
    sortOrder: (last?.sortOrder ?? -1) + 1,
  })
  revalidateRoutines()
  return { ok: true }
}

export async function updateRoutineItem(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = routineItemInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .update(routineItems)
    .set({
      title: parsed.data.title,
      notes: nullify(parsed.data.notes),
      dueOffsetDays: parsed.data.dueOffsetDays ?? null,
      priority: parsed.data.priority ?? "medium",
      listId: parsed.data.listId ?? null,
    })
    .where(
      and(eq(routineItems.id, parsedId.data), eq(routineItems.userId, userId)),
    )
  revalidateRoutines()
  return { ok: true }
}

export type DeleteRoutineItemResult =
  { ok: true; item: RoutineItemRow | null } | ActionFailure

export async function deleteRoutineItem(
  id: unknown,
): Promise<DeleteRoutineItemResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  const [deleted] = await db
    .delete(routineItems)
    .where(
      and(eq(routineItems.id, parsed.data), eq(routineItems.userId, userId)),
    )
    .returning()
  revalidateRoutines()
  return { ok: true, item: deleted ?? null }
}

/** Re-inserts an item removed via {@link deleteRoutineItem} (the "undo" path). */
export async function restoreRoutineItem(item: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = restoreRoutineItemSchema.safeParse(item)
  if (!parsed.success) return invalid(parsed.error)

  // The parent has to still be there. If the whole routine was deleted while the toast
  // was up, its cascade already took this item and re-inserting would fail on the
  // foreign key — an unhandled 23503 rather than something the user can read. This
  // doubles as the ownership check on a client-supplied routineId.
  const [owned] = await db
    .select({ id: routines.id })
    .from(routines)
    .where(
      and(eq(routines.id, parsed.data.routineId), eq(routines.userId, userId)),
    )
    .limit(1)
  if (!owned) return { ok: false, error: "That routine no longer exists." }

  await db
    .insert(routineItems)
    .values(restorableRoutineItem(parsed.data, userId))
    .onConflictDoNothing()
  revalidateRoutines()
  return { ok: true }
}

/**
 * Write the item order in one transaction. Same shape as `reorderGoals` — the client
 * sends the full ordered list rather than a moved-item pair, and every id is proven to
 * belong to the caller before anything is written.
 */
export async function reorderRoutineItems(ids: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = z.array(z.string().uuid()).max(200).safeParse(ids)
  if (!parsed.success) return invalid(parsed.error)
  if (parsed.data.length === 0) return { ok: true }

  if (new Set(parsed.data).size !== parsed.data.length) {
    return { ok: false, error: "The same item appears twice." }
  }

  const owned = await db.query.routineItems.findMany({
    where: and(
      eq(routineItems.userId, userId),
      inArray(routineItems.id, parsed.data),
    ),
    columns: { id: true },
  })
  if (owned.length !== parsed.data.length) {
    return { ok: false, error: "Unknown item." }
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of parsed.data.entries()) {
      await tx
        .update(routineItems)
        .set({ sortOrder: index })
        .where(and(eq(routineItems.id, id), eq(routineItems.userId, userId)))
    }
  })

  revalidateRoutines()
  return { ok: true }
}

// --- Running one ---

export type RunRoutineResult =
  { ok: true; taskIds: string[]; count: number } | ActionFailure

/**
 * Spin the routine's items up as real tasks, anchored at `anchorDate`.
 *
 * The insert is a single multi-row statement, so it is already atomic — an explicit
 * transaction would add nothing. It returns the created ids so the toast can offer an
 * undo that removes exactly this run and nothing else.
 */
export async function runRoutine(
  routineId: unknown,
  input: unknown,
): Promise<RunRoutineResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(routineId)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = runRoutineSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  // Scoped to the caller, so another user's routine id simply yields no items.
  const items = await db.query.routineItems.findMany({
    where: and(
      eq(routineItems.userId, userId),
      eq(routineItems.routineId, parsedId.data),
    ),
    orderBy: [asc(routineItems.sortOrder), asc(routineItems.createdAt)],
  })
  if (items.length === 0) {
    return { ok: false, error: "This routine has no tasks yet." }
  }

  // The same function the confirm dialog previewed with, so what was shown and what is
  // written cannot drift.
  const planned = previewRun(items, parsed.data.anchorDate)

  const created = await db
    .insert(tasks)
    .values(
      planned.map((task, index) => ({
        userId,
        title: task.title,
        notes: task.notes,
        dueDate: task.dueDate,
        priority: task.priority,
        listId: task.listId,
        // What lets the dashboard's agenda keep these together instead of scattering a
        // morning routine's steps through the day's other work. Nothing else reads it, and
        // a task that loses it (its routine deleted, so the FK sets null) simply stops
        // being grouped — the reading degrades rather than breaking.
        routineId: parsedId.data,
        // Keep the routine's order inside whatever date section each task lands in.
        sortOrder: index,
      })),
    )
    .returning({ id: tasks.id })

  revalidateRunEffects()
  return { ok: true, taskIds: created.map((t) => t.id), count: created.length }
}

/** Remove exactly the tasks a run created (the "undo" path on the success toast). */
export async function undoRoutineRun(taskIds: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = z.array(z.string().uuid()).max(200).safeParse(taskIds)
  if (!parsed.success) return invalid(parsed.error)
  if (parsed.data.length === 0) return { ok: true }

  // User-scoped, so this can only ever delete the caller's own rows even if the id list
  // were tampered with on its way back.
  await db
    .delete(tasks)
    .where(and(eq(tasks.userId, userId), inArray(tasks.id, parsed.data)))
  revalidateRunEffects()
  return { ok: true }
}
