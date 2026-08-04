import "server-only"
import { asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"

import { routineItems, routines } from "./schema"

export type RoutineRow = typeof routines.$inferSelect
export type RoutineItemRow = typeof routineItems.$inferSelect

export type RoutineWithItems = RoutineRow & { items: RoutineItemRow[] }

/**
 * Every routine with its items. Two reads grouped in memory rather than a join — the
 * same shape `getGoals` uses for milestones, and routines are few.
 */
export async function getRoutines(): Promise<RoutineWithItems[]> {
  const userId = await requireUserId()
  const [routineRows, itemRows] = await Promise.all([
    db.query.routines.findMany({
      where: eq(routines.userId, userId),
      orderBy: [asc(routines.createdAt)],
    }),
    db.query.routineItems.findMany({
      where: eq(routineItems.userId, userId),
      // sortOrder first so a manual reorder wins; createdAt is the tiebreak, which is
      // what every row still sorts by until something writes a position.
      orderBy: [asc(routineItems.sortOrder), asc(routineItems.createdAt)],
    }),
  ])
  return routineRows.map((routine) => ({
    ...routine,
    items: itemRows.filter((item) => item.routineId === routine.id),
  }))
}
