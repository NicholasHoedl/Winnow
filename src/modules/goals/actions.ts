"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { type ActionResult, invalid, nullify } from "@/lib/action-result"
import { requireUserId } from "@/lib/session"

import type { MilestoneRow } from "./queries"
import { goals, milestones } from "./schema"
import { goalInputSchema, milestoneInputSchema } from "./validation"

// Goals live on their own page, and the dashboard shows a summary — refresh both.
function revalidateGoals() {
  revalidatePath("/goals")
  revalidatePath("/")
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
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = goalInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { title, notes, targetDate } = parsed.data
  await db
    .update(goals)
    .set({ title, notes: nullify(notes), targetDate: nullify(targetDate) })
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
  revalidateGoals()
  return { ok: true }
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const userId = await requireUserId()
  await db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)))
  revalidateGoals()
  return { ok: true }
}

// --- Milestones ---

export async function addMilestone(
  goalId: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = milestoneInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db.insert(milestones).values({ userId, goalId, title: parsed.data.title })
  revalidateGoals()
  return { ok: true }
}

export async function toggleMilestone(
  id: string,
  done: boolean,
): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .update(milestones)
    .set({ done })
    .where(and(eq(milestones.id, id), eq(milestones.userId, userId)))
  revalidateGoals()
  return { ok: true }
}

export type DeleteMilestoneResult =
  | { ok: true; milestone: MilestoneRow | null }
  | { ok: false; error: string }

export async function deleteMilestone(
  id: string,
): Promise<DeleteMilestoneResult> {
  const userId = await requireUserId()
  const [deleted] = await db
    .delete(milestones)
    .where(and(eq(milestones.id, id), eq(milestones.userId, userId)))
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
