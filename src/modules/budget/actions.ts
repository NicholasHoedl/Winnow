"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/db"
import { type ActionResult, invalid, nullify } from "@/lib/action-result"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"

import type { Transaction } from "./queries"
import { budgets, categories, transactions } from "./schema"
import { amountToMinor, monthKey } from "./service"
import {
  categoryInputSchema,
  copyBudgetsSchema,
  restoreTransactionSchema,
  setBudgetsSchema,
  transactionInputSchema,
} from "./validation"

function revalidateBudget() {
  revalidatePath("/budget")
  revalidatePath("/")
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

  const { currency } = await getUserPreferences()
  const { amount, type, date, categoryId, payee, description } = parsed.data
  await db.insert(transactions).values({
    userId,
    amountCents: amountToMinor(amount, currency),
    type,
    date,
    categoryId: nullify(categoryId),
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

  const { currency } = await getUserPreferences()
  const { amount, type, date, categoryId, payee, description } = parsed.data
  await db
    .update(transactions)
    .set({
      amountCents: amountToMinor(amount, currency),
      type,
      date,
      categoryId: nullify(categoryId),
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
      createdAt: row.createdAt,
    })
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
