"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/db"
import { type ActionResult, invalid, nullify } from "@/lib/action-result"
import { addDays, todayInZone } from "@/lib/date"
import { cyclesInRange, periodEnd } from "@/lib/recurrence"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"

import { toRule, type Transaction } from "./queries"
import {
  budgets,
  categories,
  transactionRecurrences,
  transactions,
} from "./schema"
import { amountToMinor, monthKey } from "./service"
import {
  categoryInputSchema,
  copyBudgetsSchema,
  MAX_INITIAL_POSTS,
  restoreTransactionSchema,
  setBudgetsSchema,
  transactionInputSchema,
  transactionRecurrenceSchema,
} from "./validation"

function revalidateBudget() {
  revalidatePath("/budget")
  revalidatePath("/")
}

/**
 * null when the category is usable, else the error to return. Every write that accepts
 * a categoryId goes through this: the id arrives from the client, and without the check
 * a transaction could be filed against a category this user doesn't own (it would render
 * as "Uncategorized" while still counting toward their totals) or against one of the
 * wrong kind, which puts income spend into the expense rollups.
 */
async function checkCategory(
  userId: string,
  categoryId: string | null,
  type: "income" | "expense",
): Promise<string | null> {
  if (!categoryId) return null
  const owned = await db.query.categories.findFirst({
    where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
    columns: { kind: true },
  })
  if (!owned) return "Unknown category."
  if (owned.kind !== type) return "That category doesn't match the type."
  return null
}

// --- Categories ---

export async function createCategory(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = categoryInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db.insert(categories).values({ userId, ...parsed.data })
  revalidatePath("/budget")
  return { ok: true }
}

export async function updateCategory(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = categoryInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .update(categories)
    .set(parsed.data)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
  revalidateBudget()
  return { ok: true }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const userId = await requireUserId()
  // Transactions keep their history (category_id set to NULL); budgets for the
  // category cascade away.
  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
  revalidateBudget()
  return { ok: true }
}

// --- Transactions ---

export async function createTransaction(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = transactionInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { amount, type, date, categoryId, payee, description } = parsed.data
  const category = nullify(categoryId)
  const categoryError = await checkCategory(userId, category, type)
  if (categoryError) return { ok: false, error: categoryError }

  const { currency } = await getUserPreferences()
  await db.insert(transactions).values({
    userId,
    amountCents: amountToMinor(amount, currency),
    type,
    date,
    categoryId: category,
    payee: nullify(payee),
    description: nullify(description),
  })
  revalidateBudget()
  return { ok: true }
}

export async function updateTransaction(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = transactionInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { amount, type, date, categoryId, payee, description } = parsed.data
  const category = nullify(categoryId)
  const categoryError = await checkCategory(userId, category, type)
  if (categoryError) return { ok: false, error: categoryError }

  const { currency } = await getUserPreferences()
  await db
    .update(transactions)
    .set({
      amountCents: amountToMinor(amount, currency),
      type,
      date,
      categoryId: category,
      payee: nullify(payee),
      description: nullify(description),
    })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
  revalidateBudget()
  return { ok: true }
}

export type DeleteTransactionResult =
  { ok: true; transaction: Transaction | null } | { ok: false; error: string }

export async function deleteTransaction(
  id: string,
): Promise<DeleteTransactionResult> {
  const userId = await requireUserId()
  const [deleted] = await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning()
  revalidateBudget()
  return { ok: true, transaction: deleted ?? null }
}

/** Re-inserts a transaction removed via {@link deleteTransaction} (the undo path).
 * The row comes back from the client, so it is validated like any other input and
 * the user id always comes from the session. */
export async function restoreTransaction(tx: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = restoreTransactionSchema.safeParse(tx)
  if (!parsed.success) return invalid(parsed.error)
  const row = parsed.data

  // Only re-attach a category this user actually owns; otherwise the transaction
  // comes back uncategorized rather than pointing at someone else's category.
  let categoryId = row.categoryId
  if (categoryId) {
    const owned = await db.query.categories.findFirst({
      where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
      columns: { id: true },
    })
    if (!owned) categoryId = null
  }

  // Same treatment for the series link — a restored bill should go back to the rule it
  // came from, but only if that rule is still this user's and still exists.
  let seriesId = row.seriesId
  if (seriesId) {
    const owned = await db.query.transactionRecurrences.findFirst({
      where: and(
        eq(transactionRecurrences.id, seriesId),
        eq(transactionRecurrences.userId, userId),
      ),
      columns: { id: true },
    })
    if (!owned) seriesId = null
  }

  await db
    .insert(transactions)
    .values({
      id: row.id,
      userId,
      categoryId,
      amountCents: row.amountCents,
      type: row.type,
      date: row.date,
      payee: row.payee,
      description: row.description,
      seriesId,
      // Dropped along with the series link: (series_id, occurrence_date) is unique, so
      // keeping one without the other is meaningless.
      occurrenceDate: seriesId ? row.occurrenceDate : null,
      createdAt: row.createdAt,
    })
    // Untargeted, so it absorbs a conflict on the id OR on (series_id, occurrence_date)
    // — undo can't double-post a cycle the materializer has since re-created.
    .onConflictDoNothing()
  revalidateBudget()
  return { ok: true }
}

// --- Budgets ---

/** Writes a whole month's budgets in one transaction. Replaces the old per-category
 * action: the dialog used to fire one round-trip per category in sequence, so a
 * failure part-way through left some categories saved and the rest not. */
export async function setBudgets(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = setBudgetsSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { month, entries } = parsed.data
  const periodMonth = monthKey(month)
  const ids = entries.map((e) => e.categoryId)
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "The same category appears twice." }
  }

  // Every id must be one of THIS user's expense categories. Without this a budget
  // could be written against someone else's category id — it would still be keyed
  // to your user, so it'd render as an unnamed row and inflate the month's total.
  if (ids.length > 0) {
    const owned = await db.query.categories.findMany({
      where: and(eq(categories.userId, userId), inArray(categories.id, ids)),
      columns: { id: true, kind: true },
    })
    const allowed = new Set(
      owned.filter((c) => c.kind === "expense").map((c) => c.id),
    )
    if (ids.some((id) => !allowed.has(id))) {
      return { ok: false, error: "Unknown category." }
    }
  }

  const { currency } = await getUserPreferences()
  const toSet = entries.filter((e) => e.amount > 0)
  const toClear = entries.filter((e) => e.amount <= 0).map((e) => e.categoryId)

  await db.transaction(async (tx) => {
    if (toSet.length > 0) {
      await tx
        .insert(budgets)
        .values(
          toSet.map((e) => ({
            userId,
            categoryId: e.categoryId,
            periodMonth,
            amountCents: amountToMinor(e.amount, currency),
          })),
        )
        .onConflictDoUpdate({
          target: [budgets.userId, budgets.categoryId, budgets.periodMonth],
          // `excluded` is the row that would have been inserted — a literal here
          // would set every conflicting row to the same amount. $onUpdate doesn't
          // fire on the conflict path, so bump updatedAt explicitly.
          set: {
            amountCents: sql`excluded.amount_cents`,
            updatedAt: new Date(),
          },
        })
    }
    if (toClear.length > 0) {
      await tx
        .delete(budgets)
        .where(
          and(
            eq(budgets.userId, userId),
            eq(budgets.periodMonth, periodMonth),
            inArray(budgets.categoryId, toClear),
          ),
        )
    }
  })

  revalidateBudget()
  return { ok: true }
}

// --- Recurring transactions ---

/** Later of two 'YYYY-MM-DD' dates (they compare lexicographically). */
function laterOf(a: string, b: string): string {
  return a > b ? a : b
}

export async function createTransactionRecurrence(
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = transactionRecurrenceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const d = parsed.data

  const categoryId = nullify(d.categoryId)
  const categoryError = await checkCategory(userId, categoryId, d.type)
  if (categoryError) return { ok: false, error: categoryError }

  const { currency, timeZone, weekStartsOn } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const endDate = nullify(d.endDate)
  // Nothing before the start date has been posted, so the mark sits one day earlier.
  const postedThrough = addDays(d.startDate, -1)

  // Tell the user before their ledger fills up, rather than after.
  const pending = cyclesInRange(
    toRule({ ...d, endDate }),
    postedThrough,
    today,
    weekStartsOn,
  )
  if (pending.length > MAX_INITIAL_POSTS) {
    return {
      ok: false,
      error: `That start date would add ${pending.length} transactions at once. Pick a later start date.`,
    }
  }

  await db.insert(transactionRecurrences).values({
    userId,
    categoryId,
    amountCents: amountToMinor(d.amount, currency),
    type: d.type,
    payee: nullify(d.payee),
    description: nullify(d.description),
    freq: d.freq,
    recurrenceInterval: d.recurrenceInterval,
    weekdays: d.weekdays,
    monthlyMode: d.monthlyMode,
    startDate: d.startDate,
    endDate,
    postedThrough,
  })

  revalidateBudget()
  return { ok: true }
}

/**
 * Edits apply FORWARD ONLY — already-posted transactions are facts and are never
 * rewritten. A rent increase changes future payments and leaves past ones alone.
 *
 * Changing the SCHEDULE also skips the rest of the current period. Without that,
 * moving a monthly bill from the 1st to the 15th on the 10th would post it a second
 * time this month: the 1st is already posted, and the 15th is still ahead.
 */
export async function updateTransactionRecurrence(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = transactionRecurrenceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const d = parsed.data

  const categoryId = nullify(d.categoryId)
  const categoryError = await checkCategory(userId, categoryId, d.type)
  if (categoryError) return { ok: false, error: categoryError }

  const existing = await db.query.transactionRecurrences.findFirst({
    where: and(
      eq(transactionRecurrences.id, id),
      eq(transactionRecurrences.userId, userId),
    ),
  })
  if (!existing) return { ok: false, error: "Recurring transaction not found." }

  const { currency, timeZone, weekStartsOn } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const endDate = nullify(d.endDate)

  const scheduleChanged =
    existing.freq !== d.freq ||
    existing.recurrenceInterval !== d.recurrenceInterval ||
    existing.weekdays !== d.weekdays ||
    existing.monthlyMode !== d.monthlyMode ||
    existing.startDate !== d.startDate

  const postedThrough = scheduleChanged
    ? laterOf(
        existing.postedThrough,
        periodEnd(toRule({ ...d, endDate }), today, weekStartsOn),
      )
    : existing.postedThrough

  await db
    .update(transactionRecurrences)
    .set({
      categoryId,
      amountCents: amountToMinor(d.amount, currency),
      type: d.type,
      payee: nullify(d.payee),
      description: nullify(d.description),
      freq: d.freq,
      recurrenceInterval: d.recurrenceInterval,
      weekdays: d.weekdays,
      monthlyMode: d.monthlyMode,
      startDate: d.startDate,
      endDate,
      postedThrough,
    })
    .where(
      and(
        eq(transactionRecurrences.id, id),
        eq(transactionRecurrences.userId, userId),
      ),
    )

  revalidateBudget()
  return { ok: true }
}

/** Stops future posting. Every transaction already posted is kept — the FK is
 * ON DELETE SET NULL, so they simply detach into ordinary history. Note the
 * contrast with deleteTaskRecurrence, which deletes its open instances. */
export async function deleteTransactionRecurrence(
  id: string,
): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .delete(transactionRecurrences)
    .where(
      and(
        eq(transactionRecurrences.id, id),
        eq(transactionRecurrences.userId, userId),
      ),
    )
  revalidateBudget()
  return { ok: true }
}

export type CopyBudgetsResult =
  { ok: true; copied: number } | { ok: false; error: string }

/** Fills empty budgets in `toMonth` from `fromMonth`. Non-destructive — a category
 * that already has a budget in the target month is left alone. */
export async function copyBudgetsFromMonth(
  input: unknown,
): Promise<CopyBudgetsResult> {
  const userId = await requireUserId()
  const parsed = copyBudgetsSchema.safeParse(input)
  // Not a form — there are no fields to attach errors to, so a flat message.
  if (!parsed.success) return { ok: false, error: "Invalid month." }

  const fromMonth = monthKey(parsed.data.fromMonth)
  const toMonth = monthKey(parsed.data.toMonth)
  if (fromMonth === toMonth) {
    return { ok: false, error: "Pick a different month to copy from." }
  }

  let copied = 0
  await db.transaction(async (tx) => {
    const source = await tx.query.budgets.findMany({
      where: and(
        eq(budgets.userId, userId),
        eq(budgets.periodMonth, fromMonth),
      ),
      columns: { categoryId: true, amountCents: true },
    })
    if (source.length === 0) return
    const inserted = await tx
      .insert(budgets)
      .values(
        source.map((b) => ({
          userId,
          categoryId: b.categoryId,
          periodMonth: toMonth,
          amountCents: b.amountCents,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: budgets.id })
    copied = inserted.length
  })

  revalidateBudget()
  return { ok: true, copied }
}
