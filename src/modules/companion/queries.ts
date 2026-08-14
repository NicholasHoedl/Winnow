import "server-only"
import { and, asc, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import { goals, milestones } from "@/modules/goals/schema"

import { aiProposals } from "./schema"
import type { GoalPromptContext } from "./service"

export type ProposalRow = typeof aiProposals.$inferSelect
export type ProposalKind = ProposalRow["kind"]

/**
 * Proposals awaiting a decision, newest first.
 *
 * Only `pending`. An applied proposal has become real rows and a discarded one was
 * rejected; neither is something you still owe an answer to, and a list that never
 * shrinks stops being a queue.
 *
 * `kind` is optional and omitting it returns every kind, which is what `/companion` wants
 * — one page reviewing all four. It exists for T13, which puts each job on the page of the
 * thing it produces: without the filter `/goals` would auto-open a pending IMPORT, because
 * the view opens `pending[0]` and "newest" says nothing about which page you are on. A
 * caller that shows one kind must ask for one kind.
 */
export async function getPendingProposals(
  kind?: ProposalKind,
): Promise<ProposalRow[]> {
  const userId = await requireUserId()
  return db.query.aiProposals.findMany({
    // `and()` drops `undefined` arms, so the unfiltered call builds the same SQL it always
    // did rather than a three-clause where with a tautology in it.
    where: and(
      eq(aiProposals.userId, userId),
      eq(aiProposals.status, "pending"),
      kind ? eq(aiProposals.kind, kind) : undefined,
    ),
    orderBy: [desc(aiProposals.createdAt)],
  })
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
 * line — is what puts private text on the wire.
 *
 * The rule used to be stated as "the notes module is not imported here". That module was
 * removed in T13, so the ADR restates it without a subject: name your fields. It applies
 * with more force now rather than less, because the free text the user writes lives in
 * `goals.notes` and `tasks.notes` — columns this feature reads by design — instead of in
 * one module that could simply be fenced off.
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
    // The goal's own description — see GoalPromptContext for why it is sent at all.
    notes: goal.notes,
    targetDate: goal.targetDate,
    existingMilestones: existing.map((m) => m.title),
    today,
  }
}
