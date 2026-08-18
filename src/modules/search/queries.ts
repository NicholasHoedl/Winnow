import "server-only"
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm"

import { db } from "@/db"
import { APP_TIME_ZONE } from "@/lib/config"
import { todayInZone } from "@/lib/date"
import { requireUserId } from "@/lib/session"

import { events } from "@/modules/calendar/schema"
import { transactions } from "@/modules/budget/schema"
import { goals, milestones } from "@/modules/goals/schema"
import { habits } from "@/modules/habits/schema"
import { foods } from "@/modules/meals/schema"
import { subtasks, tasks } from "@/modules/todos/schema"

import {
  escapeLike,
  normalizeQuery,
  PER_MODULE_LIMIT,
  rankAndCap,
  scoreResult,
  snippet,
} from "./service"
import type { SearchResult } from "./types"

/**
 * Fan out a text query across every user-data module, user-scoped, and return the top
 * ranked matches. Each module contributes at most PER_MODULE_LIMIT rows (most-recent
 * first) before the pure ranker merges + caps them. Read-only: search owns no tables.
 */
export async function searchEverything(
  rawQuery: string,
): Promise<SearchResult[]> {
  const q = normalizeQuery(rawQuery)
  if (!q) return []

  const userId = await requireUserId()
  const pattern = `%${escapeLike(q)}%`

  const [
    taskRows,
    eventRows,
    foodRows,
    txnRows,
    goalRows,
    habitRows,
    milestoneRows,
    subtaskRows,
  ] = await Promise.all([
    db.query.tasks.findMany({
      where: and(
        eq(tasks.userId, userId),
        or(ilike(tasks.title, pattern), ilike(tasks.notes, pattern)),
      ),
      columns: { id: true, title: true, notes: true, dueDate: true },
      orderBy: [desc(tasks.updatedAt)],
      limit: PER_MODULE_LIMIT,
    }),
    db.query.events.findMany({
      where: and(
        eq(events.userId, userId),
        or(ilike(events.title, pattern), ilike(events.notes, pattern)),
      ),
      columns: { id: true, title: true, notes: true, startAt: true },
      orderBy: [desc(events.updatedAt)],
      limit: PER_MODULE_LIMIT,
    }),
    db.query.foods.findMany({
      where: and(eq(foods.userId, userId), ilike(foods.name, pattern)),
      columns: { id: true, name: true, servingLabel: true },
      orderBy: [desc(foods.updatedAt)],
      limit: PER_MODULE_LIMIT,
    }),
    db.query.transactions.findMany({
      where: and(
        eq(transactions.userId, userId),
        or(
          ilike(transactions.payee, pattern),
          ilike(transactions.description, pattern),
        ),
      ),
      columns: { id: true, payee: true, description: true, date: true },
      orderBy: [desc(transactions.date)],
      limit: PER_MODULE_LIMIT,
    }),
    db.query.goals.findMany({
      where: and(
        eq(goals.userId, userId),
        or(ilike(goals.title, pattern), ilike(goals.notes, pattern)),
      ),
      columns: { id: true, title: true, notes: true, targetDate: true },
      orderBy: [desc(goals.updatedAt)],
      limit: PER_MODULE_LIMIT,
    }),
    // Title only — a habit has no notes column to search, and no body to snippet.
    // Archived habits are excluded, matching `getHabitsView` and `getGoals`: a practice
    // you have retired should not come back through ⌘K.
    //
    // ROUTINES are deliberately not here. A routine is a template, not a record, so
    // finding one is a navigation — and the palette already has a nav command for the
    // page. A habit is a thing you keep, which is what makes it searchable.
    db.query.habits.findMany({
      where: and(
        eq(habits.userId, userId),
        isNull(habits.archivedAt),
        ilike(habits.title, pattern),
      ),
      columns: { id: true, title: true },
      orderBy: [desc(habits.updatedAt)],
      limit: PER_MODULE_LIMIT,
    }),
    /**
     * Milestones and subtasks: the two kinds of free text you type that nothing else here
     * covers. A milestone is the step you named on a goal, a subtask the step you named on a
     * task, and neither was findable — so the only way back to one was remembering which
     * parent it hung off.
     *
     * Note what is still deliberately absent, and why the list stops here. Routine ITEMS
     * follow routines out for the reason stated above — a template is navigation, not a
     * record. Lists are the same: a handful of names, already on screen at `/activity`.
     * Meal ENTRIES are snapshots of a food, and `foods` is already searched, so including
     * them would return the same name once per day it was eaten.
     *
     * Title only. Neither table has a notes column, so there is nothing to snippet.
     */
    db.query.milestones.findMany({
      where: and(
        eq(milestones.userId, userId),
        ilike(milestones.title, pattern),
      ),
      columns: { id: true, title: true, dueDate: true, done: true },
      orderBy: [desc(milestones.createdAt)],
      limit: PER_MODULE_LIMIT,
    }),
    db.query.subtasks.findMany({
      where: and(eq(subtasks.userId, userId), ilike(subtasks.title, pattern)),
      columns: { id: true, title: true, done: true },
      orderBy: [desc(subtasks.sortOrder)],
      limit: PER_MODULE_LIMIT,
    }),
  ])

  const results: SearchResult[] = [
    ...taskRows.map((r): SearchResult => ({
      type: "task",
      id: r.id,
      title: r.title,
      date: r.dueDate,
      href: "/activity",
      score: scoreResult(q, r.title, r.notes),
      ...(r.notes ? { subtitle: snippet(r.notes) } : {}),
    })),
    ...eventRows.map((r): SearchResult => {
      const day = todayInZone(r.startAt, APP_TIME_ZONE)
      return {
        type: "event",
        id: r.id,
        title: r.title,
        date: day,
        href: `/calendar?month=${day.slice(0, 7)}`,
        score: scoreResult(q, r.title, r.notes),
        ...(r.notes ? { subtitle: snippet(r.notes) } : {}),
      }
    }),
    ...foodRows.map((r): SearchResult => ({
      type: "food",
      id: r.id,
      title: r.name,
      subtitle: r.servingLabel,
      href: "/meals",
      score: scoreResult(q, r.name),
    })),
    ...txnRows.map((r): SearchResult => ({
      type: "transaction",
      id: r.id,
      // Same headline the budget list shows.
      title: r.payee ?? r.description ?? "",
      date: r.date,
      href: `/budget?month=${r.date.slice(0, 7)}`,
      score: scoreResult(q, `${r.payee ?? ""} ${r.description ?? ""}`.trim()),
    })),
    ...goalRows.map((r): SearchResult => ({
      type: "goal",
      id: r.id,
      title: r.title,
      date: r.targetDate,
      // The one result type that got MORE specific in T10. `/goals` could only drop you on
      // a page of every goal and leave you to find this one; `/activity?goal=` opens with
      // the list already scoped to its tasks.
      href: `/activity?goal=${r.id}`,
      score: scoreResult(q, r.title, r.notes),
      ...(r.notes ? { subtitle: snippet(r.notes) } : {}),
    })),
    // No `subtitle`. The obvious one is the cadence — "3× a week" — but that is
    // `periodLabel` in the habits SERVICE, and search deliberately does not import another
    // module's service. It costs nothing here:
    // the cadence is one tap away on the page this links to.
    //
    // No `date` either. A habit's `startDate` is when you began keeping it, which is not
    // the "when" any other result type means by that field.
    ...habitRows.map((r): SearchResult => ({
      type: "habit",
      id: r.id,
      title: r.title,
      href: "/activity/habits",
      score: scoreResult(q, r.title),
    })),
    // A milestone lives inside its goal's detail dialog, so `/goals` is as close as a URL
    // gets — the same shape as a task pointing at `/activity` rather than at itself.
    ...milestoneRows.map(
      (r): SearchResult => ({
        type: "milestone",
        id: r.id,
        title: r.title,
        date: r.dueDate,
        href: "/goals",
        score: scoreResult(q, r.title),
        ...(r.done ? { subtitle: "Done" } : {}),
      }),
    ),
    ...subtaskRows.map(
      (r): SearchResult => ({
        type: "subtask",
        id: r.id,
        title: r.title,
        href: "/activity",
        score: scoreResult(q, r.title),
        ...(r.done ? { subtitle: "Done" } : {}),
      }),
    ),
  ]

  return rankAndCap(results)
}
