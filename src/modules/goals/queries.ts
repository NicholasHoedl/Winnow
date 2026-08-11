import "server-only"
import {
  and,
  asc,
  count,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
} from "drizzle-orm"

import { db } from "@/db"
import { addDays, todayInZone } from "@/lib/date"
import { requireUserId } from "@/lib/session"
// habits → goals at the schema level, so this direction is safe: `goals/schema.ts` imports
// nothing but `users`, and nothing here reaches back into habits' own queries.
import { habitEntries, habits } from "@/modules/habits/schema"
import { tasks } from "@/modules/todos/schema"

import { goals, milestones } from "./schema"
import {
  type GoalMomentum,
  goalMomentum,
  type GoalProgress,
  goalProgress,
} from "./service"

export type GoalRow = typeof goals.$inferSelect
export type MilestoneRow = typeof milestones.$inferSelect

/** A task linked to this goal (T2), projected for display on the goal card. */
export type LinkedTask = Pick<
  typeof tasks.$inferSelect,
  "id" | "title" | "status" | "dueDate" | "completedAt"
>

export type GoalWithProgress = GoalRow & {
  milestones: MilestoneRow[]
  progress: GoalProgress
  /**
   * Open linked tasks, plus those finished inside the momentum window — NOT every task
   * ever linked to this goal.
   *
   * It used to be all of them, with no bound at all, which grew forever and made the card
   * taller every month; the same shape as the `getEventOptions()` caveat. Bounding it here
   * was folded in with the momentum work because this is the query that had to change
   * anyway. `linkedTaskTotal` carries the real denominator so nothing under-reports.
   */
  linkedTasks: LinkedTask[]
  /** Every task ever linked, counted in SQL rather than by loading the rows. */
  linkedTaskTotal: number
  /** Null when the goal has nothing to measure movement on — see `goalMomentum`. */
  momentum: GoalMomentum | null
  /** The soonest-due open linked task: what to actually do next for this goal. */
  nextAction: LinkedTask | null
}

/** Minimal shape the task-dialog goal picker binds to. */
export type GoalOption = { id: string; title: string }

/**
 * `timeZone` and `momentumDays` are parameters rather than a preferences read inside,
 * matching `getMilestonesCompletedInRange` below. The dashboard already reads preferences
 * for four other cards, so taking them here keeps the hottest page at one lookup.
 */
export async function getGoals(
  timeZone: string,
  momentumDays: number,
): Promise<GoalWithProgress[]> {
  const userId = await requireUserId()
  const today = todayInZone(new Date(), timeZone)
  const windowStart = addDays(today, -(momentumDays - 1))
  // A day of slack on a UTC instant, because the precise cut is by LOCAL date and only
  // `goalMomentum` can make it. Same two-step as getMilestonesCompletedInRange.
  const windowFloor = new Date(`${addDays(windowStart, -1)}T00:00:00Z`)

  const [goalRows, milestoneRows, taskRows, taskTotals, habitRows] =
    await Promise.all([
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
      // Tasks pointing at any of this user's goals (T2), bounded to what the card can
      // actually use: everything still open, plus whatever was finished recently enough to
      // count as movement. A task closed last year is in `linkedTaskTotal` and nowhere else.
      //
      // `gte` on a nullable column excludes NULLs, so a done task with no completedAt drops
      // out here — correct, since it can evidence neither an open commitment nor movement.
      db.query.tasks.findMany({
        where: and(
          eq(tasks.userId, userId),
          isNotNull(tasks.goalId),
          or(eq(tasks.status, "open"), gte(tasks.completedAt, windowFloor)),
        ),
        columns: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          goalId: true,
          completedAt: true,
        },
        // NULLs sort last in Postgres ASC, so a dated task outranks an undated one — which
        // is exactly the order `nextAction` wants.
        orderBy: [asc(tasks.dueDate), asc(tasks.createdAt)],
      }),
      db
        .select({ goalId: tasks.goalId, total: count() })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), isNotNull(tasks.goalId)))
        .groupBy(tasks.goalId),
      // T12b: habits attached to a goal, with any sessions logged inside the window.
      //
      // A LEFT join, deliberately: a habit with nothing logged still has to arrive, because
      // that is what makes its goal read *stalled* rather than unmeasurable. An inner join
      // would silently drop exactly the goals the badge exists to flag.
      //
      // Archived habits are excluded, matching `getHabitsView`. Retiring a practice should let
      // its goal go quiet rather than keep it alive on a habit you no longer keep.
      db
        .select({
          goalId: habits.goalId,
          habitId: habits.id,
          onDate: habitEntries.onDate,
        })
        .from(habits)
        .leftJoin(
          habitEntries,
          and(
            eq(habitEntries.habitId, habits.id),
            gte(habitEntries.onDate, windowStart),
            lte(habitEntries.onDate, today),
          ),
        )
        .where(
          and(
            eq(habits.userId, userId),
            isNotNull(habits.goalId),
            isNull(habits.archivedAt),
          ),
        ),
    ])

  const totals = new Map(taskTotals.map((row) => [row.goalId, row.total]))

  // One row per (habit, in-window entry), or one row with a null date for a habit with
  // none — so the habit ids are de-duplicated through a Set and the dates are collected
  // straight. Grouped in memory, the same shape milestones and linked tasks use above.
  const habitIds = new Map<string, Set<string>>()
  const loggedByGoal = new Map<string, string[]>()
  for (const row of habitRows) {
    if (!row.goalId) continue
    const ids = habitIds.get(row.goalId) ?? new Set<string>()
    ids.add(row.habitId)
    habitIds.set(row.goalId, ids)
    if (row.onDate) {
      const dates = loggedByGoal.get(row.goalId) ?? []
      dates.push(row.onDate)
      loggedByGoal.set(row.goalId, dates)
    }
  }

  return goalRows.map((goal) => {
    const items = milestoneRows.filter((m) => m.goalId === goal.id)
    const linked = taskRows.filter((t) => t.goalId === goal.id)
    const linkedTaskTotal = totals.get(goal.id) ?? 0
    return {
      ...goal,
      milestones: items,
      // The goal carries the numeric columns; milestones still take precedence.
      progress: goalProgress(items, goal),
      linkedTasks: linked,
      linkedTaskTotal,
      momentum: goalMomentum({
        completedAt: [
          ...linked.map((t) => t.completedAt),
          ...items.map((m) => m.completedAt),
        ],
        // Already local wall dates — see `MomentumInput.loggedOn`.
        loggedOn: loggedByGoal.get(goal.id) ?? [],
        // Counts every linked task, not just the loaded ones — a goal whose work is all
        // ancient still has something to be stalled about. Habits count the same way: one
        // attached habit is enough to make the goal measurable, logged or not.
        trackableCount:
          linkedTaskTotal + items.length + (habitIds.get(goal.id)?.size ?? 0),
        windowDays: momentumDays,
        today,
        timeZone,
      }),
      nextAction: linked.find((t) => t.status === "open") ?? null,
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
