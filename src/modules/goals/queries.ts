import "server-only"
import { asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"

import { goals, milestones } from "./schema"
import { goalProgress } from "./service"

export type GoalRow = typeof goals.$inferSelect
export type MilestoneRow = typeof milestones.$inferSelect
export type GoalWithProgress = GoalRow & {
  milestones: MilestoneRow[]
  progress: { done: number; total: number; percent: number }
}

export async function getGoals(): Promise<GoalWithProgress[]> {
  const userId = await requireUserId()
  const [goalRows, milestoneRows] = await Promise.all([
    db.query.goals.findMany({
      where: eq(goals.userId, userId),
      orderBy: [asc(goals.createdAt)],
    }),
    db.query.milestones.findMany({
      where: eq(milestones.userId, userId),
      orderBy: [asc(milestones.sortOrder), asc(milestones.createdAt)],
    }),
  ])
  return goalRows.map((goal) => {
    const items = milestoneRows.filter((m) => m.goalId === goal.id)
    return { ...goal, milestones: items, progress: goalProgress(items) }
  })
}
