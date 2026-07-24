"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { type ActionResult, invalid, nullify } from "@/lib/action-result"
import { requireUserId } from "@/lib/session"
import { getUserPreferences } from "@/modules/preferences/queries"

import type { Transaction } from "./queries"
import { budgets, categories, transactions } from "./schema"
import { amountToMinor, monthKey } from "./service"
import {
  budgetInputSchema,
  categoryInputSchema,
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

export async function updateCategory(id: string, input: unknown): Promise<ActionResult> {
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
  const { amount, type, date, categoryId, description } = parsed.data
  await db.insert(transactions).values({
    userId,
    amountCents: amountToMinor(amount, currency),
    type,
    date,
    categoryId: nullify(categoryId),
    description: nullify(description),
  })
  revalidateBudget()
  return { ok: true }
}

export async function updateTransaction(id: string, input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = transactionInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { currency } = await getUserPreferences()
  const { amount, type, date, categoryId, description } = parsed.data
  await db
    .update(transactions)
    .set({
      amountCents: amountToMinor(amount, currency),
      type,
      date,
      categoryId: nullify(categoryId),
      description: nullify(description),
    })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
  revalidateBudget()
  return { ok: true }
}

export type DeleteTransactionResult =
  | { ok: true; transaction: Transaction | null }
  | { ok: false; error: string }

export async function deleteTransaction(id: string): Promise<DeleteTransactionResult> {
  const userId = await requireUserId()
  const [deleted] = await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning()
  revalidateBudget()
  return { ok: true, transaction: deleted ?? null }
}

export async function restoreTransaction(tx: Transaction): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .insert(transactions)
    .values({
      id: tx.id,
      userId,
      categoryId: tx.categoryId,
      amountCents: tx.amountCents,
      type: tx.type,
      date: tx.date,
      description: tx.description,
      createdAt: tx.createdAt,
    })
    .onConflictDoNothing()
  revalidateBudget()
  return { ok: true }
}

// --- Budgets ---

export async function setBudget(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = budgetInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { currency } = await getUserPreferences()
  const { categoryId, month, amount } = parsed.data
  const amountCents = amountToMinor(amount, currency)
  await db
    .insert(budgets)
    .values({ userId, categoryId, periodMonth: monthKey(month), amountCents })
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.categoryId, budgets.periodMonth],
      // $onUpdate doesn't fire on the conflict path, so bump updatedAt here.
      set: { amountCents, updatedAt: new Date() },
    })
  revalidateBudget()
  return { ok: true }
}

export async function deleteBudget(id: string): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .delete(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
  revalidateBudget()
  return { ok: true }
}
