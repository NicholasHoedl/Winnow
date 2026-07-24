"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { type ActionResult, invalid } from "@/lib/action-result"
import { requireUserId } from "@/lib/session"

import type { Food, MealEntry } from "./queries"
import { foods, macroTargets, mealEntries } from "./schema"
import {
  foodInputSchema,
  macroTargetsSchema,
  mealEntryInputSchema,
} from "./validation"

function revalidateMeals() {
  revalidatePath("/meals")
  revalidatePath("/")
}

// --- Foods (library) ---

export async function createFood(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = foodInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db.insert(foods).values({ userId, ...parsed.data })
  revalidatePath("/meals")
  return { ok: true }
}

export async function updateFood(id: string, input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = foodInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .update(foods)
    .set(parsed.data)
    .where(and(eq(foods.id, id), eq(foods.userId, userId)))
  revalidatePath("/meals")
  return { ok: true }
}

export type DeleteFoodResult =
  | { ok: true; food: Food | null }
  | { ok: false; error: string }

export async function deleteFood(id: string): Promise<DeleteFoodResult> {
  const userId = await requireUserId()
  // Meal entries keep their snapshot (food_id is set to NULL by the FK).
  const [deleted] = await db
    .delete(foods)
    .where(and(eq(foods.id, id), eq(foods.userId, userId)))
    .returning()
  revalidatePath("/meals")
  return { ok: true, food: deleted ?? null }
}

/** Re-inserts a food removed via {@link deleteFood} (the "undo" path). The user
 * id always comes from the session — any client-supplied one is ignored. The FK
 * nulled `food_id` on past entries is not re-linked; only the food row returns. */
export async function restoreFood(food: Food): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .insert(foods)
    .values({
      id: food.id,
      userId,
      name: food.name,
      servingLabel: food.servingLabel,
      calories: food.calories,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
      createdAt: food.createdAt,
    })
    .onConflictDoNothing()
  revalidatePath("/meals")
  return { ok: true }
}

// --- Meal entries ---

export async function logMeal(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = mealEntryInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const {
    name,
    servingLabel,
    calories,
    proteinG,
    carbsG,
    fatG,
    servings,
    mealType,
    date,
    foodId,
    saveToLibrary,
  } = parsed.data

  let resolvedFoodId = foodId && foodId !== "" ? foodId : null

  // Optionally persist a brand-new food to the library.
  if (!resolvedFoodId && saveToLibrary) {
    const [food] = await db
      .insert(foods)
      .values({ userId, name, servingLabel, calories, proteinG, carbsG, fatG })
      .returning({ id: foods.id })
    resolvedFoodId = food?.id ?? null
  }

  await db.insert(mealEntries).values({
    userId,
    foodId: resolvedFoodId,
    date,
    mealType: mealType || null,
    servings,
    name,
    servingLabel,
    calories,
    proteinG,
    carbsG,
    fatG,
  })
  revalidateMeals()
  return { ok: true }
}

export async function updateMealEntry(id: string, input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = mealEntryInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const { name, servingLabel, calories, proteinG, carbsG, fatG, servings, mealType, date } =
    parsed.data

  await db
    .update(mealEntries)
    .set({
      name,
      servingLabel,
      calories,
      proteinG,
      carbsG,
      fatG,
      servings,
      mealType: mealType || null,
      date,
    })
    .where(and(eq(mealEntries.id, id), eq(mealEntries.userId, userId)))
  revalidateMeals()
  return { ok: true }
}

export type DeleteMealEntryResult =
  | { ok: true; entry: MealEntry | null }
  | { ok: false; error: string }

export async function deleteMealEntry(id: string): Promise<DeleteMealEntryResult> {
  const userId = await requireUserId()
  const [deleted] = await db
    .delete(mealEntries)
    .where(and(eq(mealEntries.id, id), eq(mealEntries.userId, userId)))
    .returning()
  revalidateMeals()
  return { ok: true, entry: deleted ?? null }
}

export async function restoreMealEntry(entry: MealEntry): Promise<ActionResult> {
  const userId = await requireUserId()
  await db
    .insert(mealEntries)
    .values({
      id: entry.id,
      userId,
      foodId: entry.foodId,
      date: entry.date,
      mealType: entry.mealType,
      servings: entry.servings,
      name: entry.name,
      servingLabel: entry.servingLabel,
      calories: entry.calories,
      proteinG: entry.proteinG,
      carbsG: entry.carbsG,
      fatG: entry.fatG,
      createdAt: entry.createdAt,
    })
    .onConflictDoNothing()
  revalidateMeals()
  return { ok: true }
}

// --- Targets ---

export async function setMacroTargets(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = macroTargetsSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .insert(macroTargets)
    .values({ userId, ...parsed.data })
    .onConflictDoUpdate({ target: macroTargets.userId, set: parsed.data })
  revalidateMeals()
  return { ok: true }
}
