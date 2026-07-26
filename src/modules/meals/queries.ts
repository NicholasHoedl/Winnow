import "server-only"
import { and, asc, desc, eq, gte, lte } from "drizzle-orm"

import { db } from "@/db"
import { addDays } from "@/lib/date"
import { requireUserId } from "@/lib/session"

import {
  bodyWeights,
  foods,
  macroTargets,
  mealEntries,
  waterLogs,
} from "./schema"
import { macroProgress, sumMacros } from "./service"

export type Food = typeof foods.$inferSelect
export type MealEntry = typeof mealEntries.$inferSelect
export type MacroTargets = typeof macroTargets.$inferSelect
export type WaterLog = typeof waterLogs.$inferSelect
export type BodyWeight = typeof bodyWeights.$inferSelect

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

/**
 * The targets in effect on `date`: the latest period that had started by then.
 *
 * Returns null before the earliest period, which `macroProgress` already renders as
 * "no target". In practice existing installs never hit that — migration 0017 backfills
 * the pre-existing row to 1970-01-01 so it covers all of history.
 */
export async function getMacroTargets(
  date: string,
): Promise<MacroTargets | null> {
  const userId = await requireUserId()
  const row = await db.query.macroTargets.findFirst({
    where: and(
      eq(macroTargets.userId, userId),
      lte(macroTargets.effectiveFrom, date),
    ),
    orderBy: [desc(macroTargets.effectiveFrom)],
  })
  return row ?? null
}

/** Every target period, newest first — the list the targets dialog manages. */
export async function getMacroTargetHistory(): Promise<MacroTargets[]> {
  const userId = await requireUserId()
  return db.query.macroTargets.findMany({
    where: eq(macroTargets.userId, userId),
    orderBy: [desc(macroTargets.effectiveFrom)],
  })
}

/** One day's water logs, oldest first — each tap is its own row. */
export async function getWaterLogs(date: string): Promise<WaterLog[]> {
  const userId = await requireUserId()
  return db.query.waterLogs.findMany({
    where: and(eq(waterLogs.userId, userId), eq(waterLogs.date, date)),
    orderBy: [asc(waterLogs.createdAt)],
  })
}

/** The day's weigh-in, or null. At most one exists — unique(user_id, date). */
export async function getBodyWeight(date: string): Promise<BodyWeight | null> {
  const userId = await requireUserId()
  const row = await db.query.bodyWeights.findFirst({
    where: and(eq(bodyWeights.userId, userId), eq(bodyWeights.date, date)),
  })
  return row ?? null
}

/**
 * Weigh-ins in the `days` leading up to `endDate`, oldest first — the raw points behind
 * the trend chart. Bucketing into weeks happens in the pure `weeklyWeightSeries`.
 */
export async function getWeightTrend(
  endDate: string,
  days = 91,
): Promise<BodyWeight[]> {
  const userId = await requireUserId()
  // Bound the scan the same way the budget trends query does.
  const span = Math.min(730, Math.max(1, Math.floor(days)))
  return db.query.bodyWeights.findMany({
    where: and(
      eq(bodyWeights.userId, userId),
      gte(bodyWeights.date, addDays(endDate, -(span - 1))),
      lte(bodyWeights.date, endDate),
    ),
    orderBy: [asc(bodyWeights.date)],
  })
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
    // Same resolution as getMacroTargets. This function already took a date, so
    // every caller — the dashboard, /today, the digest — got history for free.
    db.query.macroTargets.findFirst({
      where: and(
        eq(macroTargets.userId, userId),
        lte(macroTargets.effectiveFrom, date),
      ),
      orderBy: [desc(macroTargets.effectiveFrom)],
    }),
  ])
  const totals = sumMacros(entries)
  return { totals, progress: macroProgress(totals, targets ?? null) }
}
