import "server-only"
import { and, asc, eq, gte, isNotNull, lt } from "drizzle-orm"

import { db } from "@/db"
import { addDays, todayInZone } from "@/lib/date"
import { requireUserId } from "@/lib/session"
import { tasks } from "@/modules/todos/schema"

import { goals, milestones } from "./schema"
import { type GoalProgress, goalProgress } from "./service"

export type GoalRow = typeof goals.$inferSelect
export type MilestoneRow = typeof milestones.$inferSelect

/** A task linked to this goal (T2), projected for read-only display on the goal card. */
export type LinkedTask = Pick<
  typeof tasks.$inferSelect,
  "id" | "title" | "status" | "dueDate"
>

export type GoalWithProgress = GoalRow & {
  milestones: MilestoneRow[]
  progress: GoalProgress
  linkedTasks: LinkedTask[]
}

/** Minimal shape the task-dialog goal picker binds to. */
export type GoalOption = { id: string; title: string }

export async function getGoals(): Promise<GoalWithProgress[]> {
  const userId = await requireUserId()
  const [goalRows, milestoneRows, taskRows] = await Promise.all([
    db.query.goals.findMany({
      where: eq(goals.userId, userId),
      // sortOrder first so a manual drag wins; createdAt stays the tiebreak, which
      // is what every existing row (all sortOrder 0) still sorts by.
      orderBy: [asc(goals.sortOrder), asc(goals.createdAt)],
    }),
    db.query.milestones.findMany({
      where: eq(milestones.userId, userId),
      orderBy: [asc(milestones.sortOrder), asc(milestones.createdAt)],
    }),
    // Tasks pointing at any of this user's goals (T2). Projected — the card only
    // displays them; /todos stays the place to act on a task.
    db.query.tasks.findMany({
      where: and(eq(tasks.userId, userId), isNotNull(tasks.goalId)),
      columns: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        goalId: true,
      },
      orderBy: [asc(tasks.dueDate), asc(tasks.createdAt)],
    }),
  ])
  return goalRows.map((goal) => {
    const items = milestoneRows.filter((m) => m.goalId === goal.id)
    return {
      ...goal,
      milestones: items,
      // The goal carries the numeric columns; milestones still take precedence.
      progress: goalProgress(items, goal),
      linkedTasks: taskRows.filter((t) => t.goalId === goal.id),
    }
  })
}

/** Lightweight goal list (id + title) for pickers — used in the always-mounted task
 * dialog, so it skips getGoals()'s milestone/progress computation (T2). */
export async function getGoalOptions(): Promise<GoalOption[]> {
  const userId = await requireUserId()
  return db.query.goals.findMany({
    where: eq(goals.userId, userId),
    columns: { id: true, title: true },
    orderBy: [asc(goals.createdAt)],
  })
}

export type CompletedMilestone = {
  id: string
  title: string
  goalTitle: string
  completedOn: string
}

/**
 * Milestones ticked on a local date within [start, end] — the only "goal movement" the
 * schema can actually evidence.
 *
 * `goals.currentValue` is overwritten in place and `milestones.done` was a bare boolean
 * until T7d, so nothing else here can say what changed during a week rather than what is
 * true now. `completed_at` is forward-only: anything ticked before that migration has no
 * timestamp and is invisible to this, which the weekly review says out loud rather than
 * quietly reporting a zero.
 *
 * Same instant-vs-wall-date handling as `getCompletedInRange` in todos.
 */
export async function getMilestonesCompletedInRange(
  start: string,
  end: string,
  timeZone: string,
): Promise<CompletedMilestone[]> {
  const userId = await requireUserId()
  const [rows, goalRows] = await Promise.all([
    db.query.milestones.findMany({
      where: and(
        eq(milestones.userId, userId),
        eq(milestones.done, true),
        isNotNull(milestones.completedAt),
        gte(
          milestones.completedAt,
          new Date(`${addDays(start, -1)}T00:00:00Z`),
        ),
        lt(milestones.completedAt, new Date(`${addDays(end, 2)}T00:00:00Z`)),
      ),
      columns: { id: true, title: true, goalId: true, completedAt: true },
      orderBy: [asc(milestones.completedAt)],
    }),
    db.query.goals.findMany({
      where: eq(goals.userId, userId),
      columns: { id: true, title: true },
    }),
  ])

  const goalTitles = new Map(goalRows.map((goal) => [goal.id, goal.title]))
  return rows.flatMap((row) => {
    if (!row.completedAt) return []
    const completedOn = todayInZone(row.completedAt, timeZone)
    if (completedOn < start || completedOn > end) return []
    return [
      {
        id: row.id,
        title: row.title,
        goalTitle: goalTitles.get(row.goalId) ?? "",
        completedOn,
      },
    ]
  })
}
