import "server-only"
import { and, asc, desc, eq, gte, lt } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"

import { budgets, categories, transactions } from "./schema"
import { monthRange, summarizeMonth } from "./service"

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

export async function getMonthTransactions(month: string): Promise<Transaction[]> {
  const userId = await requireUserId()
  const { start, nextStart } = monthRange(month)
  return db.query.transactions.findMany({
    where: and(
      eq(transactions.userId, userId),
      gte(transactions.date, start),
      lt(transactions.date, nextStart),
    ),
    orderBy: [desc(transactions.date), desc(transactions.createdAt)],
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
