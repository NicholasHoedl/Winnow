import "server-only"
import { and, asc, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import { goals, milestones } from "@/modules/goals/schema"

import { aiProposals } from "./schema"
import type { GoalPromptContext } from "./service"

export type ProposalRow = typeof aiProposals.$inferSelect

/**
 * Proposals awaiting a decision, newest first — the bottom-right pane.
 *
 * Only `pending`. An applied proposal has become real rows and a discarded one was
 * rejected; neither is something you still owe an answer to, and a list that never
 * shrinks stops being a queue.
 */
export async function getPendingProposals(): Promise<ProposalRow[]> {
  const userId = await requireUserId()
  return db.query.aiProposals.findMany({
    where: and(
      eq(aiProposals.userId, userId),
      eq(aiProposals.status, "pending"),
    ),
    orderBy: [desc(aiProposals.createdAt)],
  })
}

export async function getProposal(id: string): Promise<ProposalRow | null> {
  const userId = await requireUserId()
  const row = await db.query.aiProposals.findFirst({
    where: and(eq(aiProposals.id, id), eq(aiProposals.userId, userId)),
  })
  return row ?? null
}

/**
 * Goals the companion can plan.
 *
 * `targetDate` rides along because the renderer needs it to judge proposed dates — a
 * milestone three days before your deadline is only notable relative to that deadline.
 * Without it every warning silently disappears, which is a failure that looks exactly
 * like success.
 */
export async function getPlannableGoals(): Promise<
  { id: string; title: string; targetDate: string | null }[]
> {
  const userId = await requireUserId()
  return db.query.goals.findMany({
    where: eq(goals.userId, userId),
    columns: { id: true, title: true, targetDate: true },
    orderBy: [asc(goals.sortOrder), asc(goals.createdAt)],
  })
}

/**
 * Assemble what the model is told about a goal.
 *
 * **This function is where ADR-0011's boundary is actually enforced.** Both reads below
 * name their columns explicitly. `findFirst` with no `columns` would hand back the whole
 * row and invite a caller to spread it into a prompt, and the habit — not any single
 * line — is what would eventually put a journal entry on the wire. The notes module is
 * not imported here, and must not be.
 */
export async function buildGoalContext(
  goalId: string,
  today: string,
): Promise<GoalPromptContext | null> {
  const userId = await requireUserId()

  const goal = await db.query.goals.findFirst({
    where: and(eq(goals.id, goalId), eq(goals.userId, userId)),
    columns: { title: true, notes: true, targetDate: true },
  })
  if (!goal) return null

  const existing = await db.query.milestones.findMany({
    where: and(
      eq(milestones.userId, userId),
      eq(milestones.goalId, goalId),
      eq(milestones.done, false),
    ),
    columns: { title: true },
    orderBy: [asc(milestones.sortOrder), asc(milestones.createdAt)],
  })

  return {
    title: goal.title,
    // The goal's own description, NOT the notes module — see GoalPromptContext.
    notes: goal.notes,
    targetDate: goal.targetDate,
    existingMilestones: existing.map((m) => m.title),
    today,
  }
}
