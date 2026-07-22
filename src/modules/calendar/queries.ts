import "server-only"
import { and, asc, eq, gte, isNull, lt, or } from "drizzle-orm"

import { db } from "@/db"
import { APP_TIME_ZONE } from "@/lib/config"
import { requireUserId } from "@/lib/session"

import { events, goals, milestones } from "./schema"
import {
  addDays,
  bucketByDay,
  expandOccurrences,
  goalProgress,
  gridRange,
  type Occurrence,
} from "./service"

export type EventRow = typeof events.$inferSelect
export type EventOccurrence = Occurrence<EventRow>
export type GoalRow = typeof goals.$inferSelect
export type MilestoneRow = typeof milestones.$inferSelect
export type GoalWithProgress = GoalRow & {
  milestones: MilestoneRow[]
  progress: { done: number; total: number; percent: number }
}

// A series can produce an occurrence in a view only if it starts before the view
// ends and its (inclusive) recurrence end is not before the view starts. This
// coarse filter over-fetches slightly; expandOccurrences then filters precisely.
function candidateWhere(userId: string, rangeStart: string, rangeEnd: string) {
  const upper = new Date(`${addDays(rangeEnd, 1)}T00:00:00.000Z`)
  return and(
    eq(events.userId, userId),
    lt(events.startAt, upper),
    or(isNull(events.recurrenceEndDate), gte(events.recurrenceEndDate, rangeStart)),
  )
}

function byDateThenTime(a: EventOccurrence, b: EventOccurrence): number {
  return (
    a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")
  )
}

export async function getMonthEvents(month: string) {
  const userId = await requireUserId()
  const { grid, start, end } = gridRange(month)
  const rows = await db.query.events.findMany({
    where: candidateWhere(userId, start, end),
  })
  const occurrences = rows
    .flatMap((e) => expandOccurrences(e, start, end, APP_TIME_ZONE))
    .sort(byDateThenTime)
  return { month, grid, byDay: bucketByDay(occurrences), occurrences }
}

/** Occurrences landing on a single day, sorted (all-day first). Dashboard uses this. */
export async function getDayEvents(date: string): Promise<EventOccurrence[]> {
  const userId = await requireUserId()
  const end = addDays(date, 1)
  const rows = await db.query.events.findMany({
    where: candidateWhere(userId, date, end),
  })
  return rows
    .flatMap((e) => expandOccurrences(e, date, end, APP_TIME_ZONE))
    .sort(byDateThenTime)
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
