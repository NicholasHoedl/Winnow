import "server-only"
import { eq } from "drizzle-orm"

import type { db } from "@/db"
import {
  budgets,
  categories,
  transactionRecurrences,
  transactions,
} from "@/modules/budget/schema"
import {
  calendarFeedTokens,
  calendars,
  eventExceptions,
  events,
} from "@/modules/calendar/schema"
import { aiProposals } from "@/modules/companion/schema"
import { goals, milestones } from "@/modules/goals/schema"
import { habitEntries, habits } from "@/modules/habits/schema"
import {
  bodyWeights,
  foods,
  macroTargets,
  mealEntries,
  waterLogs,
} from "@/modules/meals/schema"
import { userPreferences } from "@/modules/preferences/schema"
import { routineItems, routines } from "@/modules/routines/schema"
import {
  lists,
  subtasks,
  taskRecurrenceExceptions,
  taskRecurrences,
  tasks,
} from "@/modules/todos/schema"

/** Anything that can run a delete — `db` itself, or a transaction handle. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Delete every domain row the user owns, keeping the account itself.
 *
 * It lives here, taking an executor, because it now has **two** callers — "clear all
 * data" and the first half of a restore — and each needs it inside its own transaction.
 * Inlining it twice would mean two copies of a twenty-table list whose divergence is
 * precisely the bug `coverage.test.ts` exists to catch, and which has already happened
 * three times. One list, one guard pointed at it.
 *
 * FK-safe order: children before parents. Children are deleted explicitly even where a
 * cascade would cover them — relying on the cascade means the day the parent stops being
 * deleted first, the child silently leaks.
 */
export async function deleteAllUserRows(tx: Executor, userId: string) {
  // First: a proposal's `targetId` points at a goal without a foreign key, so nothing in
  // the database would stop these outliving the rows they describe.
  await tx.delete(aiProposals).where(eq(aiProposals.userId, userId))
  // Before `goals`: `habits.goal_id` is `set null`, so the order is not strictly forced —
  // but the rule here is children first, stated rather than relied on. Entries before
  // habits for the same reason, even though the cascade would cover them.
  await tx.delete(habitEntries).where(eq(habitEntries.userId, userId))
  await tx.delete(habits).where(eq(habits.userId, userId))
  await tx.delete(milestones).where(eq(milestones.userId, userId))
  await tx.delete(goals).where(eq(goals.userId, userId))
  await tx.delete(mealEntries).where(eq(mealEntries.userId, userId))
  await tx.delete(waterLogs).where(eq(waterLogs.userId, userId))
  await tx.delete(bodyWeights).where(eq(bodyWeights.userId, userId))
  await tx.delete(macroTargets).where(eq(macroTargets.userId, userId))
  await tx.delete(foods).where(eq(foods.userId, userId))
  await tx.delete(transactions).where(eq(transactions.userId, userId))
  await tx
    .delete(transactionRecurrences)
    .where(eq(transactionRecurrences.userId, userId))
  await tx.delete(budgets).where(eq(budgets.userId, userId))
  await tx.delete(categories).where(eq(categories.userId, userId))
  await tx.delete(subtasks).where(eq(subtasks.userId, userId))
  await tx.delete(tasks).where(eq(tasks.userId, userId))
  await tx
    .delete(taskRecurrenceExceptions)
    .where(eq(taskRecurrenceExceptions.userId, userId))
  // Recurrence rules were once missing from this list: clearing all data left them
  // behind, and they immediately regenerated tasks (and would now post bills) into the
  // supposedly empty account on the next page load.
  await tx.delete(taskRecurrences).where(eq(taskRecurrences.userId, userId))
  // Before `lists`: a routine item's list_id is `set null`, so the order is not strictly
  // forced — but the rule here is children first, stated rather than relied on.
  await tx.delete(routineItems).where(eq(routineItems.userId, userId))
  await tx.delete(routines).where(eq(routines.userId, userId))
  await tx.delete(lists).where(eq(lists.userId, userId))
  // Calendars were genuinely leaking — nothing deleted them, so "clear all data" wiped
  // every event and left the calendar list fully populated.
  await tx.delete(eventExceptions).where(eq(eventExceptions.userId, userId))
  await tx.delete(events).where(eq(events.userId, userId))
  await tx.delete(calendars).where(eq(calendars.userId, userId))
  await tx
    .delete(calendarFeedTokens)
    .where(eq(calendarFeedTokens.userId, userId))
  await tx.delete(userPreferences).where(eq(userPreferences.userId, userId))
}
