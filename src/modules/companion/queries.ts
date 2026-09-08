import "server-only"
import { and, asc, desc, eq, isNull } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import { goals, milestones } from "@/modules/goals/schema"
import { habits } from "@/modules/habits/schema"
import { tasks } from "@/modules/todos/schema"

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
    // The numeric target travels with the date now: `planWarnings` checks a proposed rate
    // against it, and the prompt asks for a habit in the goal's own unit so that check has
    // comparable numbers to work with. Still named columns rather than the row — ADR-0011's
    // rule is that a prompt builder must never be one schema change away from sending
    // something nobody chose to send.
    columns: {
      title: true,
      notes: true,
      targetDate: true,
      targetValue: true,
      currentValue: true,
      unit: true,
    },
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

  // Every LIVE habit, not this goal's. The question the prompt needs answered is "what
  // does my week already look like", and a practice attached to another goal — or to no
  // goal at all — is still something you do on a Tuesday. Archived ones are excluded for
  // the same reason every other read excludes them: a retired practice costs nothing.
  const practice = await db.query.habits.findMany({
    where: and(eq(habits.userId, userId), isNull(habits.archivedAt)),
    // Named columns, not the row. ADR-0011's rule, and this list is going to a third
    // party — a `.findMany()` without it would ship `unit`, `startDate` and whatever the
    // next migration adds.
    columns: { title: true, period: true, targetCount: true },
    orderBy: [asc(habits.sortOrder), asc(habits.createdAt)],
  })

  return {
    title: goal.title,
    // The goal's own description — see GoalPromptContext for why it is sent at all.
    notes: goal.notes,
    targetDate: goal.targetDate,
    targetValue: goal.targetValue,
    currentValue: goal.currentValue,
    unit: goal.unit,
    existingMilestones: existing.map((m) => m.title),
    existingHabits: practice,
    today,
  }
}

/**
 * A goal's plan as it actually stands — the rows themselves, each carrying its id.
 *
 * **This is what the panel edits once a plan has been applied**, and the id on every row
 * is the whole reason the design works. Applying a plan is a one-way fan-out of creates:
 * `addMilestone`, `createHabit`, `createTask`, with nothing recording which row came from
 * which payload entry. So "re-open the plan and have edits cascade" cannot be answered by
 * the stored payload — there is no correspondence to follow, and matching by title breaks
 * the first time a milestone is renamed anywhere else.
 *
 * Reading the real rows sidesteps that entirely: the panel edits the things themselves,
 * every one addressable by id, and there is one source of truth rather than a payload and
 * a table that drift. The alternative — a `proposal_items` mapping — buys the same cascade
 * and a divergence problem with it, on a goal whose milestones the detail dialog now makes
 * easy to edit directly.
 *
 * `done` milestones and completed tasks come too. Hiding them would make the timeline lie
 * about what has happened, and the editor draws them struck through rather than dropping
 * them.
 *
 * Archived habits do not. A retired practice keeps its history and is not part of the plan
 * any more — the same exclusion every other habit read makes.
 */
export type GoalPlanRow = {
  milestones: {
    id: string
    title: string
    dueDate: string | null
    done: boolean
  }[]
  habits: {
    id: string
    title: string
    period: "day" | "week" | "month"
    targetCount: number
    targetAmount: number | null
    unit: string | null
  }[]
  setupTasks: {
    id: string
    title: string
    dueDate: string | null
    done: boolean
  }[]
}

export async function getGoalPlan(goalId: string): Promise<GoalPlanRow | null> {
  const userId = await requireUserId()

  // The goal itself first, and its absence is a null rather than three empty lists: a goal
  // that was deleted and one that has nothing on it are different answers, and the caller
  // shows a different thing for each.
  const goal = await db.query.goals.findFirst({
    where: and(eq(goals.id, goalId), eq(goals.userId, userId)),
    columns: { id: true },
  })
  if (!goal) return null

  const [milestoneRows, habitRows, taskRows] = await Promise.all([
    db.query.milestones.findMany({
      where: and(eq(milestones.userId, userId), eq(milestones.goalId, goalId)),
      columns: { id: true, title: true, dueDate: true, done: true },
      // The order the goal dialog shows them in, so the two surfaces agree about which
      // step is third.
      orderBy: [asc(milestones.sortOrder), asc(milestones.createdAt)],
    }),
    db.query.habits.findMany({
      where: and(
        eq(habits.userId, userId),
        eq(habits.goalId, goalId),
        isNull(habits.archivedAt),
      ),
      columns: {
        id: true,
        title: true,
        period: true,
        targetCount: true,
        targetAmount: true,
        unit: true,
      },
      orderBy: [asc(habits.sortOrder), asc(habits.createdAt)],
    }),
    db.query.tasks.findMany({
      where: and(eq(tasks.userId, userId), eq(tasks.goalId, goalId)),
      columns: { id: true, title: true, dueDate: true, status: true },
      orderBy: [asc(tasks.sortOrder), asc(tasks.createdAt)],
    }),
  ])

  return {
    milestones: milestoneRows,
    habits: habitRows,
    setupTasks: taskRows.map(({ status, ...task }) => ({
      ...task,
      done: status === "done",
    })),
  }
}

/**
 * Goal ids that have had a plan applied — the predicate for the re-plan confirmation.
 *
 * Keyed on an APPLIED proposal rather than on "the goal has milestones", because the
 * question the dialog asks is "you already generated a plan for this, replace it?" — and a
 * goal whose milestones were all typed by hand has no previous plan to warn about.
 */
export async function getPlannedGoalIds(): Promise<string[]> {
  const userId = await requireUserId()
  const rows = await db.query.aiProposals.findMany({
    where: and(
      eq(aiProposals.userId, userId),
      eq(aiProposals.kind, "goal_plan"),
      eq(aiProposals.status, "applied"),
    ),
    columns: { targetId: true },
  })
  return [
    ...new Set(rows.flatMap((row) => (row.targetId ? [row.targetId] : []))),
  ]
}
