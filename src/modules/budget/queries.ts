import "server-only"
import { and, asc, desc, eq, gte, ilike, isNull, lt, or } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import { escapeLike } from "@/modules/search/service"

import { budgets, categories, transactions } from "./schema"
import {
  monthRange,
  summarizeMonth,
  UNCATEGORIZED,
  type TransactionFilters,
} from "./service"

export type Category = typeof categories.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type Budget = typeof budgets.$inferSelect

export async function getCategories(): Promise<Category[]> {
  const userId = await requireUserId()
  return db.query.categories.findMany({
    where: eq(categories.userId, userId),
    orderBy: [asc(categories.kind), asc(categories.name)],
  })
}

/** The month's transactions, optionally narrowed and re-sorted. Callers that need
 * month-wide totals must NOT derive them from this — use getBudgetSummary, which
 * always reads the whole month. */
export async function getMonthTransactions(
  month: string,
  filters: TransactionFilters = {},
): Promise<Transaction[]> {
  const userId = await requireUserId()
  const { start, nextStart } = monthRange(month)

  const conditions = [
    eq(transactions.userId, userId),
    gte(transactions.date, start),
    lt(transactions.date, nextStart),
  ]

  const q = filters.q?.trim()
  if (q) {
    const pattern = `%${escapeLike(q)}%`
    const textMatch = or(
      ilike(transactions.payee, pattern),
      ilike(transactions.description, pattern),
    )
    if (textMatch) conditions.push(textMatch)
  }
  if (filters.categoryId === UNCATEGORIZED) {
    conditions.push(isNull(transactions.categoryId))
  } else if (filters.categoryId) {
    conditions.push(eq(transactions.categoryId, filters.categoryId))
  }
  if (filters.type) conditions.push(eq(transactions.type, filters.type))

  const direction = filters.dir === "asc" ? asc : desc
  const order =
    filters.sort === "amount"
      ? [direction(transactions.amountCents)]
      : [direction(transactions.date), direction(transactions.createdAt)]

  return db.query.transactions.findMany({
    where: and(...conditions),
    // Final tiebreaker so rows with an equal date or amount can't shuffle between
    // renders (Postgres makes no ordering promise for ties).
    orderBy: [...order, asc(transactions.id)],
  })
}

export async function getMonthBudgets(month: string): Promise<Budget[]> {
  const userId = await requireUserId()
  const { start } = monthRange(month)
  return db.query.budgets.findMany({
    where: and(eq(budgets.userId, userId), eq(budgets.periodMonth, start)),
  })
}

export async function getBudgetSummary(month: string) {
  const userId = await requireUserId()
  const { start, nextStart } = monthRange(month)
  const [txns, budgetRows] = await Promise.all([
    db.query.transactions.findMany({
      where: and(
        eq(transactions.userId, userId),
        gte(transactions.date, start),
        lt(transactions.date, nextStart),
      ),
      columns: { categoryId: true, amountCents: true, type: true },
    }),
    db.query.budgets.findMany({
      where: and(eq(budgets.userId, userId), eq(budgets.periodMonth, start)),
      columns: { categoryId: true, amountCents: true },
    }),
  ])
  return summarizeMonth(txns, budgetRows)
}
