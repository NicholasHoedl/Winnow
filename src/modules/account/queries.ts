import "server-only"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import {
  budgets,
  categories,
  transactionRecurrences,
  transactions,
} from "@/modules/budget/schema"
import { calendars, eventExceptions, events } from "@/modules/calendar/schema"
import { goals, milestones } from "@/modules/goals/schema"
import {
  bodyWeights,
  foods,
  macroTargets,
  mealEntries,
  waterLogs,
} from "@/modules/meals/schema"
import { userPreferences } from "@/modules/preferences/schema"
import { lists, taskRecurrences, tasks } from "@/modules/todos/schema"

/** Everything the current user owns, for a JSON export/backup. */
export async function exportUserData() {
  const userId = await requireUserId()
  const [
    listRows,
    taskRows,
    foodRows,
    mealEntryRows,
    macroTargetRows,
    waterLogRows,
    bodyWeightRows,
    categoryRows,
    transactionRows,
    budgetRows,
    calendarRows,
    eventRows,
    eventExceptionRows,
    goalRows,
    milestoneRows,
    preferenceRows,
    taskRecurrenceRows,
    transactionRecurrenceRows,
  ] = await Promise.all([
    db.query.lists.findMany({ where: eq(lists.userId, userId) }),
    db.query.tasks.findMany({ where: eq(tasks.userId, userId) }),
    db.query.foods.findMany({ where: eq(foods.userId, userId) }),
    db.query.mealEntries.findMany({ where: eq(mealEntries.userId, userId) }),
    db.query.macroTargets.findMany({ where: eq(macroTargets.userId, userId) }),
    db.query.waterLogs.findMany({ where: eq(waterLogs.userId, userId) }),
    db.query.bodyWeights.findMany({ where: eq(bodyWeights.userId, userId) }),
    db.query.categories.findMany({ where: eq(categories.userId, userId) }),
    db.query.transactions.findMany({ where: eq(transactions.userId, userId) }),
    db.query.budgets.findMany({ where: eq(budgets.userId, userId) }),
    // Calendars and their exceptions were both missing: a backup taken before this
    // lost every calendar (name, colour, visibility) and every per-occurrence edit,
    // so restoring it reverted each edited occurrence to its series default.
    db.query.calendars.findMany({ where: eq(calendars.userId, userId) }),
    db.query.events.findMany({ where: eq(events.userId, userId) }),
    db.query.eventExceptions.findMany({
      where: eq(eventExceptions.userId, userId),
    }),
    db.query.goals.findMany({ where: eq(goals.userId, userId) }),
    db.query.milestones.findMany({ where: eq(milestones.userId, userId) }),
    db.query.userPreferences.findMany({
      where: eq(userPreferences.userId, userId),
    }),
    // Recurrence rules were missing from the export: without them a restored backup
    // would silently stop generating recurring tasks and bills.
    db.query.taskRecurrences.findMany({
      where: eq(taskRecurrences.userId, userId),
    }),
    db.query.transactionRecurrences.findMany({
      where: eq(transactionRecurrences.userId, userId),
    }),
  ])

  return {
    version: 1,
    lists: listRows,
    tasks: taskRows,
    foods: foodRows,
    mealEntries: mealEntryRows,
    macroTargets: macroTargetRows,
    waterLogs: waterLogRows,
    bodyWeights: bodyWeightRows,
    categories: categoryRows,
    transactions: transactionRows,
    budgets: budgetRows,
    calendars: calendarRows,
    events: eventRows,
    eventExceptions: eventExceptionRows,
    goals: goalRows,
    milestones: milestoneRows,
    taskRecurrences: taskRecurrenceRows,
    transactionRecurrences: transactionRecurrenceRows,
    preferences: preferenceRows[0] ?? null,
  }
}
