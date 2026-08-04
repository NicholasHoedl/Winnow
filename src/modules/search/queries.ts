import "server-only"
import { and, desc, eq, ilike, or } from "drizzle-orm"

import { db } from "@/db"
import { APP_TIME_ZONE } from "@/lib/config"
import { todayInZone } from "@/lib/date"
import { requireUserId } from "@/lib/session"

import { events } from "@/modules/calendar/schema"
import { transactions } from "@/modules/budget/schema"
import { goals } from "@/modules/goals/schema"
import { foods } from "@/modules/meals/schema"
import { notes } from "@/modules/notes/schema"
import { tasks } from "@/modules/todos/schema"

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

  const [taskRows, eventRows, foodRows, txnRows, goalRows, noteRows] =
    await Promise.all([
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
      // The body is searched as well as the title — a note whose title is optional would
      // otherwise be findable only when someone had bothered to give it one.
      db.query.notes.findMany({
        where: and(
          eq(notes.userId, userId),
          or(ilike(notes.title, pattern), ilike(notes.body, pattern)),
        ),
        columns: { id: true, title: true, body: true, entryDate: true },
        orderBy: [desc(notes.updatedAt)],
        limit: PER_MODULE_LIMIT,
      }),
    ])

  const results: SearchResult[] = [
    ...taskRows.map((r): SearchResult => ({
      type: "task",
      id: r.id,
      title: r.title,
      date: r.dueDate,
      href: "/todos",
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
      href: "/goals",
      score: scoreResult(q, r.title, r.notes),
      ...(r.notes ? { subtitle: snippet(r.notes) } : {}),
    })),
    ...noteRows.map((r): SearchResult => {
      // The notes module's `noteTitle` does this properly, but search deliberately does
      // not import another module's service (same reasoning that moved `dueStatus` into
      // lib/date rather than let goals import todos) — and `snippet` is the helper this
      // module already owns for exactly this.
      const heading = r.title ?? (snippet(r.body) || "Untitled note")
      return {
        type: "note",
        id: r.id,
        title: heading,
        date: r.entryDate,
        href: "/notes",
        score: scoreResult(q, heading, r.body),
        // Only when the heading isn't already the body — otherwise it prints twice.
        ...(r.title && r.body ? { subtitle: snippet(r.body) } : {}),
      }
    }),
  ]

  return rankAndCap(results)
}
