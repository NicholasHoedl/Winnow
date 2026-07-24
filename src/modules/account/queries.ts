import "server-only"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import { budgets, categories, transactions } from "@/modules/budget/schema"
import { events } from "@/modules/calendar/schema"
import { goals, milestones } from "@/modules/goals/schema"
import { foods, macroTargets, mealEntries } from "@/modules/meals/schema"
import { userPreferences } from "@/modules/preferences/schema"
import { lists, tasks } from "@/modules/todos/schema"

/** Everything the current user owns, for a JSON export/backup. */
export async function exportUserData() {
  const userId = await requireUserId()
  const [
    listRows,
    taskRows,
    foodRows,
    mealEntryRows,
    macroTargetRows,
    categoryRows,
    transactionRows,
    budgetRows,
    eventRows,
    goalRows,
    milestoneRows,
    preferenceRows,
  ] = await Promise.all([
    db.query.lists.findMany({ where: eq(lists.userId, userId) }),
    db.query.tasks.findMany({ where: eq(tasks.userId, userId) }),
    db.query.foods.findMany({ where: eq(foods.userId, userId) }),
    db.query.mealEntries.findMany({ where: eq(mealEntries.userId, userId) }),
    db.query.macroTargets.findMany({ where: eq(macroTargets.userId, userId) }),
    db.query.categories.findMany({ where: eq(categories.userId, userId) }),
    db.query.transactions.findMany({ where: eq(transactions.userId, userId) }),
    db.query.budgets.findMany({ where: eq(budgets.userId, userId) }),
    db.query.events.findMany({ where: eq(events.userId, userId) }),
    db.query.goals.findMany({ where: eq(goals.userId, userId) }),
    db.query.milestones.findMany({ where: eq(milestones.userId, userId) }),
    db.query.userPreferences.findMany({ where: eq(userPreferences.userId, userId) }),
  ])

  return {
    version: 1,
    lists: listRows,
    tasks: taskRows,
    foods: foodRows,
    mealEntries: mealEntryRows,
    macroTargets: macroTargetRows,
    categories: categoryRows,
    transactions: transactionRows,
    budgets: budgetRows,
    events: eventRows,
    goals: goalRows,
    milestones: milestoneRows,
    preferences: preferenceRows[0] ?? null,
  }
}
