import "server-only"
import { and, asc, desc, eq, gte, isNotNull, isNull } from "drizzle-orm"

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

/** The entry columns both reads select, and exactly what the maths consumes. */
type EntryFields = { onDate: string; amount: number | null }

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
      // `amount` is null on every entry of a session habit and on everything logged before
      // a habit was switched to measured. `tallyByPeriod` is where that means something.
      columns: { habitId: true, onDate: true, amount: true },
    }),
  ])

  const byHabit = new Map<string, EntryFields[]>()
  for (const entry of entryRows) {
    const found = byHabit.get(entry.habitId)
    if (found) found.push(entry)
    else byHabit.set(entry.habitId, [entry])
  }

  const loaded = { from: entryFloor, to: today }
  const drawn = { from, to: today }

  const cards = habitRows.map((habit) => {
    const entries = byHabit.get(habit.id) ?? []
    const periods = tallyByPeriod(entries, habit, weekStartsOn)
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

/** An archived habit, reduced to what the "retired" list needs to offer it back. */
export type ArchivedHabit = { id: string; title: string; archivedAt: Date }

/**
 * Habits that have been retired.
 *
 * The only read in this module that does NOT filter `archivedAt`, and it exists because
 * nothing else did. `archiveHabit` promised "reversible, unlike delete" and the toast said
 * "its history is kept" — but every query excluded archived rows and no surface listed
 * them, so archiving was a one-way disappearance and the reassurance was false. The
 * `unarchiveHabit` action had been sitting unused since it was written.
 *
 * Deliberately thin: no entries, no streak, no adherence. A retired habit is something you
 * are deciding whether to bring back, not something you are reading numbers off.
 */
export async function getArchivedHabits(): Promise<ArchivedHabit[]> {
  const userId = await requireUserId()
  const rows = await db.query.habits.findMany({
    where: and(eq(habits.userId, userId), isNotNull(habits.archivedAt)),
    columns: { id: true, title: true, archivedAt: true },
    // Most recently retired first: the one you archived by mistake is the one you came
    // here for.
    orderBy: [desc(habits.archivedAt)],
  })
  return rows.filter((row): row is ArchivedHabit => row.archivedAt !== null)
}

/** A habit reduced to what a strip or a summary row draws: its name and how it is doing. */
export type HabitStripCard = {
  id: string
  title: string
  period: HabitPeriod
  /**
   * The goal this practice serves, or null.
   *
   * Carried so the dashboard can list a habit UNDER its goal. Cheap in a way the rest of
   * this shape is not an accident about: it is a plain column on `habits`, not a windowed
   * reading, so selecting it costs no join and does not touch the entry window below.
   *
   * Null covers two cases the UI treats the same: never attached, and attached to a goal
   * that has since been deleted — `goal_id` is `ON DELETE SET NULL` because giving up a
   * target should not delete the running (schema.ts).
   */
  goalId: string | null
  /**
   * done/target for the period containing today. The only reading this shape carries.
   *
   * This shape gained NOTHING when measured habits shipped, which was the point of putting
   * `measured` and `unit` on `Adherence` itself: four surfaces draw a quota from a `now`,
   * and each of them needs to know whether the numbers are sessions or kilometres. Adding
   * the columns here instead would have meant four card shapes, four prop threads, and
   * four chances for one surface to read the rule differently from the others.
   */
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
      // `targetCount`, `targetAmount` and `unit` are selected but not returned: they feed
      // `adherence` here and are folded into `now`, so the client gets the reading rather
      // than the rule. Everything else flows straight through via the rest-spread below.
      //
      // The last two arrived with measured habits. They are what makes this read able to
      // tell "3 sessions a week" from "20 words a day", and leaving them out would not
      // have failed — the strip would simply have shown every measured habit as though its
      // target were one session. What prevents that is `adherence`'s narrow `Pick`: it
      // names these columns, so omitting one is a type error rather than a wrong number.
      columns: {
        id: true,
        title: true,
        period: true,
        targetCount: true,
        targetAmount: true,
        unit: true,
        goalId: true,
      },
      orderBy: [asc(habits.sortOrder), asc(habits.createdAt)],
    }),
    db.query.habitEntries.findMany({
      where: and(
        eq(habitEntries.userId, userId),
        gte(habitEntries.onDate, floor),
      ),
      columns: { habitId: true, onDate: true, amount: true },
    }),
  ])

  const byHabit = new Map<string, EntryFields[]>()
  for (const entry of entryRows) {
    const found = byHabit.get(entry.habitId)
    if (found) found.push(entry)
    else byHabit.set(entry.habitId, [entry])
  }

  return habitRows.map(({ targetCount, targetAmount, unit, ...habit }) => {
    const rule = { period: habit.period, targetCount, targetAmount, unit }
    return {
      ...habit,
      now: adherence(
        tallyByPeriod(byHabit.get(habit.id) ?? [], rule, weekStartsOn),
        rule,
        today,
        weekStartsOn,
      ),
    }
  })
}

/**
 * The full rows for every live habit — no entries, no readings.
 *
 * `/goals` already loads `getHabitStrip`, and that shape is deliberately five fields
 * (see its note). It is enough to DRAW a practice and not enough to EDIT one: `HabitDialog`
 * reads `period`, `targetCount`, `unit`, `targetAmount`, `startDate` and `endDate`, none of
 * which the strip carries.
 *
 * A third query rather than widening either of the other two. The strip's objection is to
 * the ENTRY WINDOW — 400 days of rows versus about 37 — not to the column count, and this
 * loads no entries at all: one indexed read of a handful of rows, on a page that already
 * makes five parallel queries. Widening the strip instead would have pushed six unused
 * columns onto the dashboard, `/activity` and the habits page as well.
 *
 * Archived habits are excluded, matching every other read: a retired practice keeps its
 * history but is not something a goal still lists.
 *
 * **Every live habit, not only the ones attached to a goal.** It was goal-scoped when the
 * goal dialog was its only reader, and the plan panel needs the whole week: the load
 * warning asks what the account already keeps, and a practice with no goal on it is still
 * something you do on a Tuesday. The dialog filters by `goalId` at the point of use and
 * always did, so nothing there changes.
 */
export async function getLiveHabits(): Promise<HabitRow[]> {
  const userId = await requireUserId()
  return db.query.habits.findMany({
    where: and(eq(habits.userId, userId), isNull(habits.archivedAt)),
    columns: { userId: false },
    orderBy: [asc(habits.sortOrder), asc(habits.createdAt)],
  })
}
