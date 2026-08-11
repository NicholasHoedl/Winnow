import "server-only"
import { and, asc, eq, gte, isNull } from "drizzle-orm"

import { db } from "@/db"
import { addDays, todayInZone } from "@/lib/date"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"

import { habitEntries, habits } from "./schema"
import {
  adherence,
  currentPeriodFloor,
  habitStreak,
  tallyByDay,
  tallyByPeriod,
  windowAdherence,
  type Adherence,
  type HabitPeriod,
  type HabitStreak,
} from "./service"

/** `userId` is dropped the way `getTaskRecurrences` drops it — it is never rendered. */
export type HabitRow = Omit<typeof habits.$inferSelect, "userId">

export type HabitCard = {
  habit: HabitRow
  /** done/target for the period containing today. What the rail and the page both show. */
  now: Adherence
  streak: HabitStreak
  /** Periods met across the drawn window — the page's ring. */
  window: { met: number; elapsed: number; percent: number }
  /**
   * Local days something was logged, inside the drawn window.
   *
   * An ARRAY, not the `Map` the service produces: this crosses into a client component, and
   * a Map does not survive the RSC payload — it arrives as `{}` with no error anywhere.
   */
  days: { date: string; count: number }[]
}

export type HabitsView = {
  cards: HabitCard[]
  /** Inclusive bounds of the heatmap. `to` is the user's today. */
  from: string
  to: string
  weekStartsOn: number
}

/**
 * How far back the heatmap is drawn, and the span the page's ring is scored over.
 *
 * Until T12d this was also the rail's window, and the comment here defended that: a cheaper
 * window there would have made the rail's STREAK disagree with the page it links to. That
 * reasoning was right and still is — a streak and a window percentage are both functions of
 * how far back entries were loaded, so two surfaces computing them from different windows
 * genuinely print different numbers for one habit.
 *
 * What changed is the reading, not the rule. `getHabitStrip` shows only `adherence` for the
 * period containing today, and every window containing today produces that identically — so
 * it can bound its scan at about a month and still agree with this page BY CONSTRUCTION,
 * rather than by matching window sizes. The 90 and 400 below now exist solely for the
 * streak, the ring and the heatmap, which only `/activity/habits` draws.
 */
export const HABIT_WINDOW_DAYS = 90

/**
 * How far back entries are LOADED, which is further than they are drawn.
 *
 * A monthly habit has three periods inside 90 days and thirteen inside 400, so a streak
 * bounded at the heatmap's window would under-report it badly. `habitStreak` clamps its
 * walk to whatever is loaded, so this number is the ceiling on how long a streak can read.
 * 400 mirrors the recurrence engine's catch-up clamp.
 */
export const HABIT_ENTRY_DAYS = 400

/**
 * Every live habit with its readings. Two user-scoped reads, grouped in memory — the shape
 * `getGoals` uses for milestones and `getRoutines` for items.
 *
 * Archived habits are excluded here rather than filtered by the caller, so no surface can
 * accidentally show one. Their rows and entries are untouched: a retired habit's history is
 * still true, and unarchiving restores the streak it had.
 */
export async function getHabitsView(): Promise<HabitsView> {
  const userId = await requireUserId()
  const { timeZone, weekStartsOn } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const from = addDays(today, -(HABIT_WINDOW_DAYS - 1))
  const entryFloor = addDays(today, -(HABIT_ENTRY_DAYS - 1))

  const [habitRows, entryRows] = await Promise.all([
    db.query.habits.findMany({
      where: and(eq(habits.userId, userId), isNull(habits.archivedAt)),
      columns: { userId: false },
      // sortOrder first so a manual position wins; createdAt is the tiebreak, which is what
      // every row sorts by until something writes a position.
      orderBy: [asc(habits.sortOrder), asc(habits.createdAt)],
    }),
    db.query.habitEntries.findMany({
      where: and(
        eq(habitEntries.userId, userId),
        gte(habitEntries.onDate, entryFloor),
      ),
      columns: { habitId: true, onDate: true },
    }),
  ])

  const byHabit = new Map<string, { onDate: string }[]>()
  for (const entry of entryRows) {
    const found = byHabit.get(entry.habitId)
    if (found) found.push(entry)
    else byHabit.set(entry.habitId, [entry])
  }

  const loaded = { from: entryFloor, to: today }
  const drawn = { from, to: today }

  const cards = habitRows.map((habit) => {
    const entries = byHabit.get(habit.id) ?? []
    const periods = tallyByPeriod(entries, habit.period, weekStartsOn)
    return {
      habit,
      now: adherence(periods, habit, today, weekStartsOn),
      // Against everything LOADED, so a long streak is not truncated by the drawn window.
      streak: habitStreak(periods, habit, loaded, weekStartsOn),
      // Against what is DRAWN, so the ring and the heatmap describe the same span.
      window: windowAdherence(periods, habit, drawn, weekStartsOn),
      days: [...tallyByDay(entries)]
        .filter(([date]) => date >= from)
        .map(([date, count]) => ({ date, count })),
    }
  })

  return { cards, from, to: today, weekStartsOn }
}

/** A habit reduced to what a strip or a summary row draws: its name and how it is doing. */
export type HabitStripCard = {
  id: string
  title: string
  period: HabitPeriod
  /** done/target for the period containing today. The only reading this shape carries. */
  now: Adherence
}

/**
 * The cheap read, for surfaces that show `now` and nothing else — the strip above the task
 * list and the dashboard's practice card.
 *
 * `getHabitsView` is the wrong tool for them and was being used anyway: it loads 400 days of
 * entries and hands a client component a thirteen-column row, a streak, a window percentage
 * and up to ninety `{date, count}` pairs, of which those surfaces render four fields. This
 * loads about a month and four fields.
 *
 * The floor is `currentPeriodFloor`, not a fixed day count, because it is derived from what
 * `adherence` actually needs: the earliest start of any period containing today. See the
 * note on `HABIT_WINDOW_DAYS` for why a cheaper window is safe here and would not be for a
 * streak.
 *
 * No upper bound on `onDate`, matching `getHabitsView` — an entry backfilled into the
 * current period counts on both surfaces or on neither.
 */
export async function getHabitStrip(): Promise<HabitStripCard[]> {
  const userId = await requireUserId()
  const { timeZone, weekStartsOn } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const floor = currentPeriodFloor(today, weekStartsOn)

  const [habitRows, entryRows] = await Promise.all([
    db.query.habits.findMany({
      where: and(eq(habits.userId, userId), isNull(habits.archivedAt)),
      // `targetCount` is selected but not returned: it feeds `adherence` here and is folded
      // into `now.target`, so the client gets the reading rather than the rule.
      columns: { id: true, title: true, period: true, targetCount: true },
      orderBy: [asc(habits.sortOrder), asc(habits.createdAt)],
    }),
    db.query.habitEntries.findMany({
      where: and(
        eq(habitEntries.userId, userId),
        gte(habitEntries.onDate, floor),
      ),
      columns: { habitId: true, onDate: true },
    }),
  ])

  const byHabit = new Map<string, { onDate: string }[]>()
  for (const entry of entryRows) {
    const found = byHabit.get(entry.habitId)
    if (found) found.push(entry)
    else byHabit.set(entry.habitId, [entry])
  }

  return habitRows.map(({ targetCount, ...habit }) => ({
    ...habit,
    now: adherence(
      tallyByPeriod(byHabit.get(habit.id) ?? [], habit.period, weekStartsOn),
      { period: habit.period, targetCount },
      today,
      weekStartsOn,
    ),
  }))
}
