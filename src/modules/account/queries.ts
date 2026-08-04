import "server-only"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"

import { EXPORT_VERSION } from "./payload"
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
import { goals, milestones } from "@/modules/goals/schema"
import {
  bodyWeights,
  foods,
  macroTargets,
  mealEntries,
  waterLogs,
} from "@/modules/meals/schema"
import { notes } from "@/modules/notes/schema"
import { userPreferences } from "@/modules/preferences/schema"
import { routineItems, routines } from "@/modules/routines/schema"
import {
  lists,
  subtasks,
  taskRecurrenceExceptions,
  taskRecurrences,
  tasks,
} from "@/modules/todos/schema"

/** Everything the current user owns, for a JSON export/backup. */
export async function exportUserData() {
  // Every query below orders by `id`. Without it Postgres is free to return rows in
  // whatever physical order it likes, and the import's delete-and-reinsert changes that
  // order — so export → import → export produced two payloads with the same rows shuffled.
  // That made `e2e/import.spec.ts`'s round-trip intermittently red (it was noted as an
  // unexplained flake in T6a and diagnosed in T6b), but the flake is the symptom: a backup
  // that reshuffles itself on every round-trip also can't be diffed against the last one.
  const userId = await requireUserId()
  const [
    listRows,
    taskRows,
    subtaskRows,
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
    calendarFeedTokenRows,
    goalRows,
    milestoneRows,
    preferenceRows,
    taskRecurrenceRows,
    taskRecurrenceExceptionRows,
    transactionRecurrenceRows,
    noteRows,
    routineRows,
    routineItemRows,
  ] = await Promise.all([
    db.query.lists.findMany({
      where: eq(lists.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.tasks.findMany({
      where: eq(tasks.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.subtasks.findMany({
      where: eq(subtasks.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.foods.findMany({
      where: eq(foods.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.mealEntries.findMany({
      where: eq(mealEntries.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.macroTargets.findMany({
      where: eq(macroTargets.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.waterLogs.findMany({
      where: eq(waterLogs.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.bodyWeights.findMany({
      where: eq(bodyWeights.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.categories.findMany({
      where: eq(categories.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.transactions.findMany({
      where: eq(transactions.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.budgets.findMany({
      where: eq(budgets.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    // Calendars and their exceptions were both missing: a backup taken before this
    // lost every calendar (name, colour, visibility) and every per-occurrence edit,
    // so restoring it reverted each edited occurrence to its series default.
    db.query.calendars.findMany({
      where: eq(calendars.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.events.findMany({
      where: eq(events.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.eventExceptions.findMany({
      where: eq(eventExceptions.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    // The .ics subscribe token rides along deliberately: a restored backup should leave
    // the phone's existing subscription working rather than silently going dead. It does
    // mean the export file carries a live credential — see ADR-0008.
    db.query.calendarFeedTokens.findMany({
      where: eq(calendarFeedTokens.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.goals.findMany({
      where: eq(goals.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.milestones.findMany({
      where: eq(milestones.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.userPreferences.findMany({
      where: eq(userPreferences.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    // Recurrence rules were missing from the export: without them a restored backup
    // would silently stop generating recurring tasks and bills.
    db.query.taskRecurrences.findMany({
      where: eq(taskRecurrences.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.taskRecurrenceExceptions.findMany({
      where: eq(taskRecurrenceExceptions.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.transactionRecurrences.findMany({
      where: eq(transactionRecurrences.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.notes.findMany({
      where: eq(notes.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.routines.findMany({
      where: eq(routines.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
    db.query.routineItems.findMany({
      where: eq(routineItems.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    }),
  ])

  return {
    version: EXPORT_VERSION,
    lists: listRows,
    tasks: taskRows,
    subtasks: subtaskRows,
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
    calendarFeedTokens: calendarFeedTokenRows,
    goals: goalRows,
    milestones: milestoneRows,
    taskRecurrences: taskRecurrenceRows,
    taskRecurrenceExceptions: taskRecurrenceExceptionRows,
    transactionRecurrences: transactionRecurrenceRows,
    notes: noteRows,
    routines: routineRows,
    routineItems: routineItemRows,
    preferences: preferenceRows[0] ?? null,
  }
}
