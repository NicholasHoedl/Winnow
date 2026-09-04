import "server-only"
import { cache } from "react"
import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
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
// `users` and `events` and nothing else, and nothing here reaches back into habits' own
// queries.
import { events } from "@/modules/calendar/schema"
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
  /**
   * The event this goal is aimed at, resolved — or null.
   *
   * Note that `targetDate` on this row is the EFFECTIVE date: when a goal names an event,
   * `getGoals` overwrites the stored column with the event's own day, so nothing downstream
   * has to know the link exists. This field is only for saying *why* the date is what it is,
   * and for linking through to the event.
   */
  targetEvent: { id: string; title: string } | null
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
        // NULLs sort last in Postgres ASC, so a dated task outranks an undated one — the
        // order the goal detail dialog lists them in.
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

  /**
   * The events any goal is aimed at.
   *
   * A second round trip rather than a join, and only when a goal actually names one — most
   * accounts will skip it entirely. Joining would have meant a left join on the goals query
   * for a column that is null on nearly every row.
   *
   * `startAt` is the SERIES start for a recurring event. A goal aimed at a repeating event is
   * an odd thing to want ("run a half marathon" happens once), and resolving "which
   * occurrence" would mean pulling in `applyExceptions` and the whole overlay — so the first
   * occurrence is the deliberate answer rather than an oversight.
   */
  const targetEventIds = [
    ...new Set(
      goalRows
        .map((goal) => goal.eventId)
        .filter((id): id is string => id !== null),
    ),
  ]
  const targetEvents = targetEventIds.length
    ? await db.query.events.findMany({
        // `userId` as well as the id list: the ids come from this user's own goals, but a
        // scoped read costs nothing and keeps the pattern uniform across this file.
        where: and(
          eq(events.userId, userId),
          inArray(events.id, targetEventIds),
        ),
        columns: { id: true, title: true, startAt: true },
      })
    : []
  const eventById = new Map(targetEvents.map((event) => [event.id, event]))

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
    // The linked event WINS over the stored `target_date`, and resolving it here rather than
    // at each call site is the whole point: the card, the detail dialog and the companion's
    // `planWarnings` all keep reading one field and none of them needed changing. A goal with
    // no event, or whose event has been deleted (`set null`), falls back to what was typed.
    const targetEvent = goal.eventId
      ? (eventById.get(goal.eventId) ?? null)
      : null
    return {
      ...goal,
      targetDate: targetEvent
        ? todayInZone(targetEvent.startAt, timeZone)
        : goal.targetDate,
      targetEvent: targetEvent
        ? { id: targetEvent.id, title: targetEvent.title }
        : null,
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
        // A goal younger than a week is not stalled, it is new — see
        // `MOMENTUM_GRACE_DAYS`.
        createdAt: goal.createdAt,
        windowDays: momentumDays,
        today,
        timeZone,
      }),
    }
  })
}

/** Lightweight goal list (id + title) for pickers — used in the always-mounted task
 * dialog, so it skips getGoals()'s milestone/progress computation (T2). `cache()` for the
 * same reason as getLists: the shell's dialog and the page can both want it in one render. */
/**
 * A CEILING, not a filter — unlike `getEventOptions`' window.
 *
 * Goals are naturally few: they are things a person is working toward, not a log, so no real
 * account reaches this. It exists because this is awaited in `(app)/layout.tsx` and therefore
 * rides in every authenticated page's RSC payload, and "naturally few" is an assumption about
 * behaviour rather than a property of the schema. A restore from a generated file would
 * otherwise put the whole set on every page.
 */
const GOAL_OPTION_CAP = 500

export const getGoalOptions = cache(async (): Promise<GoalOption[]> => {
  const userId = await requireUserId()
  return db.query.goals.findMany({
    where: eq(goals.userId, userId),
    columns: { id: true, title: true },
    orderBy: [asc(goals.createdAt)],
    limit: GOAL_OPTION_CAP,
  })
})

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
