import "server-only"
import { and, asc, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"

import { foods, macroTargets, mealEntries } from "./schema"
import { macroProgress, sumMacros } from "./service"

export type Food = typeof foods.$inferSelect
export type MealEntry = typeof mealEntries.$inferSelect
export type MacroTargets = typeof macroTargets.$inferSelect

export async function getFoods(): Promise<Food[]> {
  const userId = await requireUserId()
  return db.query.foods.findMany({
    where: eq(foods.userId, userId),
    orderBy: [asc(foods.name)],
  })
}

export async function getMealEntries(date: string): Promise<MealEntry[]> {
  const userId = await requireUserId()
  return db.query.mealEntries.findMany({
    where: and(eq(mealEntries.userId, userId), eq(mealEntries.date, date)),
    orderBy: [asc(mealEntries.createdAt)],
  })
}

/** A user's most-recent logged entries, newest-first — feeds recentFrequentFoods. */
export async function getRecentEntries(limit = 100): Promise<MealEntry[]> {
  const userId = await requireUserId()
  return db.query.mealEntries.findMany({
    where: eq(mealEntries.userId, userId),
    orderBy: [desc(mealEntries.createdAt)],
    limit,
  })
}

export async function getMacroTargets(): Promise<MacroTargets | null> {
  const userId = await requireUserId()
  const row = await db.query.macroTargets.findFirst({
    where: eq(macroTargets.userId, userId),
  })
  return row ?? null
}

/** Dashboard summary for a given day: totals + per-macro progress vs targets. */
export async function getMacroSummary(date: string) {
  const userId = await requireUserId()
  const [entries, targets] = await Promise.all([
    db.query.mealEntries.findMany({
      where: and(eq(mealEntries.userId, userId), eq(mealEntries.date, date)),
      columns: {
        servings: true,
        calories: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
      },
    }),
    db.query.macroTargets.findFirst({ where: eq(macroTargets.userId, userId) }),
  ])
  const totals = sumMacros(entries)
  return { totals, progress: macroProgress(totals, targets ?? null) }
}
