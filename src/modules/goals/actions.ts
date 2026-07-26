"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { type ActionResult, invalid, nullify } from "@/lib/action-result"
import { revalidateHubs } from "@/lib/revalidate"
import { requireUserId } from "@/lib/session"

import type { MilestoneRow } from "./queries"
import { goals, milestones } from "./schema"
import { goalInputSchema, milestoneInputSchema } from "./validation"

/**
 * The row id every single-item delete takes. A Server Action is a public RPC endpoint, so
 * `id: string` is a compile-time annotation and nothing more — anything can be posted. A
 * non-uuid reaches Postgres as a comparison against a `uuid` column and throws
 * `invalid input syntax for type uuid`, which surfaces as an error boundary instead of a
 * clean rejection. Ownership is enforced separately, by the userId in every where clause.
 */
const idSchema = z.string().uuid()

// Goals live on their own page, and the hubs show a summary — refresh both.
function revalidateGoals() {
  revalidatePath("/goals")
  revalidateHubs()
}

// --- Goals ---

export async function createGoal(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = goalInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, targetDate } = parsed.data
  await db.insert(goals).values({
    userId,
    title,
    notes: nullify(notes),
    targetDate: nullify(targetDate),
  })
  revalidateGoals()
  return { ok: true }
}

export async function updateGoal(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = goalInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, targetDate } = parsed.data
  await db
    .update(goals)
    .set({ title, notes: nullify(notes), targetDate: nullify(targetDate) })
    .where(and(eq(goals.id, parsedId.data), eq(goals.userId, userId)))
  revalidateGoals()
  return { ok: true }
}

export async function deleteGoal(id: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .delete(goals)
    .where(and(eq(goals.id, parsed.data), eq(goals.userId, userId)))
  revalidateGoals()
  return { ok: true }
}

// --- Milestones ---

export async function addMilestone(
  goalId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(goalId)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = milestoneInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .insert(milestones)
    .values({ userId, goalId: parsedId.data, title: parsed.data.title })
  revalidateGoals()
  return { ok: true }
}

export async function toggleMilestone(
  id: unknown,
  done: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  // `done` is guarded for the same reason as the id: it lands in a `boolean` column, so
  // anything else posted here is a write error rather than a rejected input.
  const parsedDone = z.boolean().safeParse(done)
  if (!parsedDone.success) return invalid(parsedDone.error)

  await db
    .update(milestones)
    .set({ done: parsedDone.data })
    .where(and(eq(milestones.id, parsedId.data), eq(milestones.userId, userId)))
  revalidateGoals()
  return { ok: true }
}

export type DeleteMilestoneResult =
  { ok: true; milestone: MilestoneRow | null } | { ok: false; error: string }

export async function deleteMilestone(
  id: unknown,
): Promise<DeleteMilestoneResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  const [deleted] = await db
    .delete(milestones)
    .where(and(eq(milestones.id, parsed.data), eq(milestones.userId, userId)))
    .returning()
  revalidateGoals()
  return { ok: true, milestone: deleted ?? null }
}

/** Re-inserts a milestone removed via {@link deleteMilestone} (the "undo" path).
 * The user id always comes from the session — any client-supplied one is ignored. */
export async function restoreMilestone(
  milestone: MilestoneRow,
): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .insert(milestones)
    .values({
      id: milestone.id,
      userId,
      goalId: milestone.goalId,
      title: milestone.title,
      done: milestone.done,
      sortOrder: milestone.sortOrder,
      createdAt: milestone.createdAt,
    })
    .onConflictDoNothing()
  revalidateGoals()
  return { ok: true }
}
