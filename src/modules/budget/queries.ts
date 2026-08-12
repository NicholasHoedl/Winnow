import "server-only"
import { cache } from "react"
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  or,
} from "drizzle-orm"

import { db } from "@/db"
import { monthSeries, todayInZone } from "@/lib/date"
import { cyclesInRange, type RecurrenceRule } from "@/lib/recurrence"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"
import { escapeLike } from "@/modules/search/service"

import {
  budgets,
  categories,
  transactionRecurrences,
  transactions,
} from "./schema"
import {
  monthRange,
  summarizeMonth,
  summarizeMonths,
  UNCATEGORIZED,
  type MonthlySummary,
  type TransactionFilters,
} from "./service"

export type Category = typeof categories.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type Budget = typeof budgets.$inferSelect
export type TransactionRecurrence = typeof transactionRecurrences.$inferSelect

/**
 * The rule behind a posted transaction, with `userId` dropped — it is never rendered, the
 * same treatment `TaskSeries` gets. This is what prefills the "Series" editor.
 */
export type TransactionSeries = Omit<TransactionRecurrence, "userId">

/**
 * A transaction plus the rule that posted it, or `null` for a hand-entered one.
 *
 * Mirrors `TaskWithSeries`, and for the same reason: without the rule in hand, the only
 * thing the UI can offer a repeating transaction is "Stop repeating" — which is why
 * `updateTransactionRecurrence` existed from T4 with nothing calling it. Editing a
 * schedule meant deleting it and rebuilding it from memory.
 */
export type TransactionWithSeries = Transaction & {
  series: TransactionSeries | null
}

/** A rule row as the shared engine wants it. Transactions have no flexible mode. */
export function toRule(row: {
  freq: RecurrenceRule["freq"]
  recurrenceInterval: number
  weekdays: number
  monthlyMode: RecurrenceRule["monthlyMode"]
  startDate: string
  endDate: string | null
}): RecurrenceRule {
  return { ...row, flexible: false }
}

/**
 * Post everything that has come due for one rule, then advance its high-water mark.
 *
 * The whole thing is one transaction with the rule row locked, so two concurrent
 * renders can't both post the same cycles. Within it the ORDER MATTERS: insert
 * first, advance `postedThrough` second. That's at-least-once, and the unique
 * (series_id, occurrence_date) index makes the retry a no-op. The reverse order
 * would be at-most-once — a crash between the two would skip a payment silently,
 * which is the failure that actually loses money.
 *
 * There is deliberately no delete step. The recurring-task generator retires
 * off-cycle instances; a posted transaction is a fact about money and is never
 * removed or rewritten by the generator.
 */
async function postDueOccurrences(
  userId: string,
  ruleId: string,
  today: string,
  weekStartsOn: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [rule] = await tx
      .select()
      .from(transactionRecurrences)
      .where(
        and(
          eq(transactionRecurrences.id, ruleId),
          eq(transactionRecurrences.userId, userId),
        ),
      )
      .for("update")
    // Another render may have caught this rule up while we waited for the lock.
    if (!rule || rule.postedThrough >= today) return

    const cycles = cyclesInRange(
      toRule(rule),
      rule.postedThrough,
      today,
      weekStartsOn,
    )

    if (cycles.length > 0) {
      await tx
        .insert(transactions)
        .values(
          cycles.map((cycle) => ({
            userId,
            categoryId: rule.categoryId,
            amountCents: rule.amountCents,
            type: rule.type,
            date: cycle.date,
            payee: rule.payee,
            description: rule.description,
            seriesId: rule.id,
            occurrenceDate: cycle.occurrenceDate,
          })),
        )
        .onConflictDoNothing({
          target: [transactions.seriesId, transactions.occurrenceDate],
        })
    }

    await tx
      .update(transactionRecurrences)
      .set({ postedThrough: today, updatedAt: new Date() })
      .where(eq(transactionRecurrences.id, rule.id))
  })
}

/**
 * Bring every recurring rule up to date. Lazy-on-read (no cron), like the recurring
 * tasks generator — awaited by the budget reads below.
 *
 * `cache()` makes it run once per request even though several queries call it.
 * Failures are swallowed on purpose: a bad rule must degrade to "no new rows",
 * not take down the money pages through budget/error.tsx. It also must never call
 * revalidatePath — that throws during render.
 */
export const ensureRecurringTransactions = cache(
  async (userId: string): Promise<void> => {
    try {
      const { timeZone, weekStartsOn } = await getUserPreferences()
      const today = todayInZone(new Date(), timeZone)
      const due = await db.query.transactionRecurrences.findMany({
        where: and(
          eq(transactionRecurrences.userId, userId),
          lt(transactionRecurrences.postedThrough, today),
        ),
        columns: { id: true },
      })
      // One transaction per rule — never one around all of them, which would hold a
      // pool connection for the whole loop.
      for (const rule of due) {
        await postDueOccurrences(userId, rule.id, today, weekStartsOn)
      }
    } catch {
      /* next read will retry */
    }
  },
)

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
): Promise<TransactionWithSeries[]> {
  const userId = await requireUserId()
  await ensureRecurringTransactions(userId)
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

  const rows = await db.query.transactions.findMany({
    where: and(...conditions),
    // Final tiebreaker so rows with an equal date or amount can't shuffle between
    // renders (Postgres makes no ordering promise for ties).
    orderBy: [...order, asc(transactions.id)],
  })

  // Rules fetched separately and joined in memory, the shape `getTasks` uses. Scoped to
  // the ids actually on screen rather than every rule the user has: a month usually shows
  // a handful, and the alternative is shipping the whole rule table to render one badge.
  const seriesIds = [
    ...new Set(rows.flatMap((row) => (row.seriesId ? [row.seriesId] : []))),
  ]
  if (seriesIds.length === 0) {
    return rows.map((row) => ({ ...row, series: null }))
  }

  const ruleRows = await db.query.transactionRecurrences.findMany({
    // Still user-scoped, though `seriesId` came from a row already proven to be theirs —
    // it costs an index column and means this read is safe read in isolation.
    where: and(
      eq(transactionRecurrences.userId, userId),
      inArray(transactionRecurrences.id, seriesIds),
    ),
    columns: { userId: false },
  })
  const byId = new Map(ruleRows.map((rule) => [rule.id, rule]))

  return rows.map((row) => ({
    ...row,
    series: (row.seriesId ? byId.get(row.seriesId) : null) ?? null,
  }))
}

/** Rollups for the `monthCount` months ending at (and including) `endMonth`, oldest
 * first — the series behind the trend charts. One range read per table rather than
 * N month queries; months with no activity still come back as zero rows. */
export async function getBudgetTrends(
  endMonth: string,
  monthCount: number,
): Promise<MonthlySummary[]> {
  const userId = await requireUserId()
  await ensureRecurringTransactions(userId)
  // Bound the scan: this is the only query in the app that spans months.
  const count = Math.min(24, Math.max(1, Math.floor(monthCount)))
  const months = monthSeries(endMonth, count)
  const { start } = monthRange(months[0])
  const { nextStart } = monthRange(months[months.length - 1])

  const [txns, budgetRows] = await Promise.all([
    db.query.transactions.findMany({
      where: and(
        eq(transactions.userId, userId),
        gte(transactions.date, start),
        lt(transactions.date, nextStart),
      ),
      columns: { categoryId: true, amountCents: true, type: true, date: true },
    }),
    db.query.budgets.findMany({
      where: and(
        eq(budgets.userId, userId),
        gte(budgets.periodMonth, start),
        lt(budgets.periodMonth, nextStart),
      ),
      columns: { categoryId: true, amountCents: true, periodMonth: true },
    }),
  ])
  return summarizeMonths(txns, budgetRows, months)
}

export async function getBudgetSummary(month: string) {
  const userId = await requireUserId()
  await ensureRecurringTransactions(userId)
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

/**
 * Income, expense and per-category spend over an arbitrary half-open range.
 *
 * Reuses `summarizeMonth` unchanged — despite the name it takes rows and never reads a
 * date, so a week's transactions summarize exactly like a month's.
 *
 * Deliberately passes NO budgets. They are stored per calendar month
 * (`budgets.period_month`), and there is no honest way to slice one into a week: a
 * seven-day share of a monthly grocery budget is a number nobody set. The weekly review
 * shows this alongside month-to-date-vs-budget from `getBudgetSummary` instead, which is
 * a figure that actually exists.
 */
export async function getRangeSummary(start: string, nextStart: string) {
  const userId = await requireUserId()
  await ensureRecurringTransactions(userId)
  const txns = await db.query.transactions.findMany({
    where: and(
      eq(transactions.userId, userId),
      gte(transactions.date, start),
      lt(transactions.date, nextStart),
    ),
    columns: { categoryId: true, amountCents: true, type: true },
  })
  return summarizeMonth(txns, [])
}
