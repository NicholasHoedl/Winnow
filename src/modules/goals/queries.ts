import "server-only"
import { and, asc, eq, isNotNull } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import { tasks } from "@/modules/todos/schema"

import { goals, milestones } from "./schema"
import { goalProgress } from "./service"

export type GoalRow = typeof goals.$inferSelect
export type MilestoneRow = typeof milestones.$inferSelect

/** A task linked to this goal (T2), projected for read-only display on the goal card. */
export type LinkedTask = Pick<
  typeof tasks.$inferSelect,
  "id" | "title" | "status" | "dueDate"
>

export type GoalWithProgress = GoalRow & {
  milestones: MilestoneRow[]
  progress: { done: number; total: number; percent: number }
  linkedTasks: LinkedTask[]
}

/** Minimal shape the task-dialog goal picker binds to. */
export type GoalOption = { id: string; title: string }

export async function getGoals(): Promise<GoalWithProgress[]> {
  const userId = await requireUserId()
  const [goalRows, milestoneRows, taskRows] = await Promise.all([
    db.query.goals.findMany({
      where: eq(goals.userId, userId),
      orderBy: [asc(goals.createdAt)],
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
      progress: goalProgress(items),
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
