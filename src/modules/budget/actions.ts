"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"

import type { Transaction } from "./queries"
import { budgets, categories, transactions } from "./schema"
import { dollarsToCents, monthKey } from "./service"
import {
  budgetInputSchema,
  categoryInputSchema,
  transactionInputSchema,
} from "./validation"

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "")
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

function invalid(error: z.ZodError): ActionResult {
  return {
    ok: false,
    error: "Please fix the errors below.",
    fieldErrors: fieldErrorsFrom(error),
  }
}

function nullify(value: string | null | undefined): string | null {
  return value == null || value === "" ? null : value
}

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

  const { amount, type, date, categoryId, description } = parsed.data
  await db.insert(transactions).values({
    userId,
    amountCents: dollarsToCents(amount),
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

  const { amount, type, date, categoryId, description } = parsed.data
  await db
    .update(transactions)
    .set({
      amountCents: dollarsToCents(amount),
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

  const { categoryId, month, amount } = parsed.data
  const amountCents = dollarsToCents(amount)
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
