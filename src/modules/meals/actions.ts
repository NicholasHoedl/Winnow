"use server"

import { revalidatePath } from "next/cache"
import { and, asc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { type ActionResult, invalid, nullify } from "@/lib/action-result"
import { revalidateHubs } from "@/lib/revalidate"
import { requireUserId } from "@/lib/session"

import { fetchProductByBarcode, searchProducts } from "./off-client"
import type { ImportedFood } from "./off-mapping"
import { describeOffFailure } from "./off-request"
import type { Food, MacroTargets, MealEntry, WaterLog } from "./queries"
import {
  copiedMealEntry,
  restorableFood,
  restorableMacroTarget,
  restorableMealEntry,
  restorableWaterLog,
} from "./restore"
import {
  bodyWeights,
  foods,
  macroTargets,
  mealEntries,
  waterLogs,
} from "./schema"
import {
  bodyWeightSchema,
  copyDaySchema,
  daySchema,
  foodInputSchema,
  macroTargetsSchema,
  mealEntryInputSchema,
  offBarcodeSchema,
  offQuerySchema,
  restoreFoodSchema,
  restoreMacroTargetSchema,
  restoreMealEntrySchema,
  restoreWaterLogSchema,
  waterLogSchema,
} from "./validation"

/**
 * The row id every single-item delete takes. A Server Action is a public RPC endpoint, so
 * `id: string` is a compile-time annotation and nothing more — anything can be posted. A
 * non-uuid reaches Postgres as a comparison against a `uuid` column and throws
 * `invalid input syntax for type uuid`, which surfaces as an error boundary instead of a
 * clean rejection. Same reason deleteBodyWeight parses with daySchema rather than
 * z.string(). Ownership is enforced separately, by the userId in every where clause.
 */
const idSchema = z.string().uuid()

// Entries and targets move the macro numbers the hubs render. The food-library
// actions below deliberately revalidate only /meals: entries snapshot their macros,
// so editing or deleting a food changes no total anywhere.
function revalidateMeals() {
  revalidatePath("/meals")
  revalidateHubs()
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

export async function updateFood(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = foodInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .update(foods)
    .set(parsed.data)
    .where(and(eq(foods.id, parsedId.data), eq(foods.userId, userId)))
  revalidatePath("/meals")
  return { ok: true }
}

export type DeleteFoodResult =
  { ok: true; food: Food | null } | { ok: false; error: string }

export async function deleteFood(id: unknown): Promise<DeleteFoodResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  // Meal entries keep their snapshot (food_id is set to NULL by the FK).
  const [deleted] = await db
    .delete(foods)
    .where(and(eq(foods.id, parsed.data), eq(foods.userId, userId)))
    .returning()
  revalidatePath("/meals")
  return { ok: true, food: deleted ?? null }
}

/**
 * Re-inserts a food removed via {@link deleteFood} (the "undo" path). The user id always
 * comes from the session — any client-supplied one is ignored. The FK nulled `food_id`
 * on past entries is not re-linked; only the food row returns.
 *
 * The column list lives in restore.ts, where a test compares it against the table's own
 * columns — this shape has silently dropped a newly added column twice in this codebase.
 */
export async function restoreFood(food: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = restoreFoodSchema.safeParse(food)
  if (!parsed.success) return invalid(parsed.error)
  await db
    .insert(foods)
    .values(restorableFood(parsed.data, userId))
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
    servings,
    mealType,
    date,
    foodId,
    saveToLibrary,
    barcode,
    ...snapshot
  } = parsed.data

  let resolvedFoodId = foodId && foodId !== "" ? foodId : null

  // Optionally persist a brand-new food to the library. Spreading `snapshot` means a
  // column added to the schema reaches the library row without a second edit here.
  if (!resolvedFoodId && saveToLibrary) {
    const [food] = await db
      .insert(foods)
      .values({ userId, ...snapshot, barcode: nullify(barcode) })
      .returning({ id: foods.id })
    resolvedFoodId = food?.id ?? null
  }

  await db.insert(mealEntries).values({
    userId,
    foodId: resolvedFoodId,
    date,
    mealType: mealType || null,
    servings,
    ...snapshot,
  })
  revalidateMeals()
  return { ok: true }
}

export async function updateMealEntry(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = mealEntryInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  // `foodId`, `saveToLibrary` and `barcode` are food-row concerns, not entry columns.
  // Dropping them into the rest-discard is what keeps an edit from re-linking the entry
  // to a library food or re-saving one; `snapshot` is then every nutrition column, so a
  // column added to the schema flows through here without another edit.
  const {
    servings,
    mealType,
    date,
    foodId,
    saveToLibrary,
    barcode,
    ...snapshot
  } = parsed.data
  // Named above only to keep them OUT of `snapshot`; `void` says that's deliberate,
  // since this config doesn't exempt rest-siblings from no-unused-vars.
  void [foodId, saveToLibrary, barcode]

  await db
    .update(mealEntries)
    .set({ ...snapshot, servings, mealType: mealType || null, date })
    .where(
      and(eq(mealEntries.id, parsedId.data), eq(mealEntries.userId, userId)),
    )
  revalidateMeals()
  return { ok: true }
}

export type DeleteMealEntryResult =
  { ok: true; entry: MealEntry | null } | { ok: false; error: string }

export async function deleteMealEntry(
  id: unknown,
): Promise<DeleteMealEntryResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  const [deleted] = await db
    .delete(mealEntries)
    .where(and(eq(mealEntries.id, parsed.data), eq(mealEntries.userId, userId)))
    .returning()
  revalidateMeals()
  return { ok: true, entry: deleted ?? null }
}

/** Undo for {@link deleteMealEntry}. Column list + its coverage test live in restore.ts. */
export async function restoreMealEntry(entry: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = restoreMealEntrySchema.safeParse(entry)
  if (!parsed.success) return invalid(parsed.error)
  await db
    .insert(mealEntries)
    .values(restorableMealEntry(parsed.data, userId))
    .onConflictDoNothing()
  revalidateMeals()
  return { ok: true }
}

// --- Water ---

export type DeleteWaterResult =
  { ok: true; log: WaterLog | null } | { ok: false; error: string }

/** Append one drink. Each tap is its own row, so this is a plain insert. */
export async function logWater(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = waterLogSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db.insert(waterLogs).values({ userId, ...parsed.data })
  revalidateMeals()
  return { ok: true }
}

export async function deleteWaterLog(id: unknown): Promise<DeleteWaterResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  const [deleted] = await db
    .delete(waterLogs)
    .where(and(eq(waterLogs.id, parsed.data), eq(waterLogs.userId, userId)))
    .returning()
  revalidateMeals()
  return { ok: true, log: deleted ?? null }
}

/** Undo for {@link deleteWaterLog}. Column list + test live in restore.ts. */
export async function restoreWaterLog(log: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = restoreWaterLogSchema.safeParse(log)
  if (!parsed.success) return invalid(parsed.error)
  await db
    .insert(waterLogs)
    .values(restorableWaterLog(parsed.data, userId))
    .onConflictDoNothing()
  revalidateMeals()
  return { ok: true }
}

// --- Body weight ---

/**
 * Record the day's weight. Upserts on (userId, date): weight is measured once a day, so
 * a second entry is a correction rather than a second data point.
 */
export async function setBodyWeight(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = bodyWeightSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .insert(bodyWeights)
    .values({ userId, ...parsed.data })
    .onConflictDoUpdate({
      target: [bodyWeights.userId, bodyWeights.date],
      // $onUpdate doesn't fire on the conflict path.
      set: { weightLb: parsed.data.weightLb, updatedAt: new Date() },
    })
  revalidateMeals()
  return { ok: true }
}

export async function deleteBodyWeight(date: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  // daySchema, not z.string(): a bare string reaches Postgres as a `date` comparison
  // and throws on anything unparseable, turning bad input into a crash.
  const parsed = daySchema.safeParse(date)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .delete(bodyWeights)
    .where(
      and(eq(bodyWeights.userId, userId), eq(bodyWeights.date, parsed.data)),
    )
  revalidateMeals()
  return { ok: true }
}

// --- Copy a day ---

/** Absurdity guard, not a product limit — mirrors T3's "reject a rule that would post
 *  more than 60 rows at once" rather than silently writing a wall of entries. */
const MAX_COPY_ENTRIES = 100

export type CopyDayResult =
  | { ok: true; copied: number; entryIds: string[] }
  | { ok: false; error: string }

/**
 * Duplicate every entry from one day onto another.
 *
 * **Deliberately not idempotent.** Running it twice appends a second set, exactly like
 * the existing "Log again" button. `meal_entries` has no natural key by design — two
 * identical bananas is a real thing to log — so inventing one to dedupe copies would
 * break legitimate duplicates. The undo (via the returned ids) is the safety net.
 *
 * Read and write happen in one transaction so a concurrent edit to the source day
 * can't produce a half-copied result.
 */
export async function copyDay(input: unknown): Promise<CopyDayResult> {
  const userId = await requireUserId()
  const parsed = copyDaySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Pick two valid dates." }

  const { from, to } = parsed.data
  if (from === to) {
    return { ok: false, error: "Pick a different day to copy from." }
  }

  const result = await db.transaction(async (tx) => {
    const source = await tx.query.mealEntries.findMany({
      where: and(eq(mealEntries.userId, userId), eq(mealEntries.date, from)),
      orderBy: [asc(mealEntries.createdAt)],
    })
    if (source.length === 0) {
      return { ok: false as const, error: "That day has nothing logged." }
    }
    if (source.length > MAX_COPY_ENTRIES) {
      return {
        ok: false as const,
        error: `That day has ${source.length} entries — too many to copy at once.`,
      }
    }

    const inserted = await tx
      .insert(mealEntries)
      .values(source.map((entry) => copiedMealEntry(entry, userId, to)))
      .returning({ id: mealEntries.id })

    return {
      ok: true as const,
      copied: inserted.length,
      entryIds: inserted.map((row) => row.id),
    }
  })

  // After the commit, not inside the transaction callback — revalidating for a write
  // that then rolled back would refresh the page to show data that doesn't exist.
  if (result.ok) revalidateMeals()
  return result
}

/** Undo partner for {@link copyDay}: removes exactly the rows it created. */
export async function deleteMealEntries(ids: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = z.array(idSchema).max(500).safeParse(ids)
  if (!parsed.success) return invalid(parsed.error)
  if (parsed.data.length === 0) return { ok: true }

  await db
    .delete(mealEntries)
    // Scoped by userId as well as the ids — the list comes from the client.
    .where(
      and(eq(mealEntries.userId, userId), inArray(mealEntries.id, parsed.data)),
    )
  revalidateMeals()
  return { ok: true }
}

// --- Food database (Open Food Facts) ---

/** What the dialog gets back: candidates, or a message it can render inline. */
export type FoodSearchResult =
  { ok: true; foods: ImportedFood[] } | { ok: false; error: string }

/** One product, or `food: null` when OFF simply doesn't have that barcode. */
export type BarcodeLookupResult =
  { ok: true; food: ImportedFood | null } | { ok: false; error: string }

/**
 * Search the food database. Reads only — nothing is written until the user explicitly
 * imports, because OFF data is frequently wrong and a search that wrote rows would grow
 * the library on every keystroke (ADR-0005).
 *
 * Requires a session like every other action here: this is the one call that costs an
 * outbound request, so it isn't left open to an unauthenticated caller.
 */
export async function searchFoodDatabase(
  query: unknown,
): Promise<FoodSearchResult> {
  await requireUserId()
  const parsed = offQuerySchema.safeParse(query)
  if (!parsed.success) return { ok: true, foods: [] }

  const result = await searchProducts(parsed.data)
  return result.ok
    ? { ok: true, foods: result.data }
    : { ok: false, error: describeOffFailure(result.failure) }
}

/** Look one product up by barcode. Same read-only contract as the search above. */
export async function lookupBarcode(
  barcode: unknown,
): Promise<BarcodeLookupResult> {
  await requireUserId()
  const parsed = offBarcodeSchema.safeParse(barcode)
  if (!parsed.success) return { ok: true, food: null }

  const result = await fetchProductByBarcode(parsed.data)
  return result.ok
    ? { ok: true, food: result.data }
    : { ok: false, error: describeOffFailure(result.failure) }
}

// --- Targets ---

/**
 * Save the targets for a period. Upserts on (userId, effectiveFrom), so saving twice on
 * the same start date edits that period and saving on a new one opens another — no
 * separate "edit" vs "new period" concept for the user to learn.
 *
 * Days before the earliest period keep scoring against no target, and days already
 * covered by an earlier period are untouched. That's the whole point: changing today's
 * targets no longer rewrites what last month was measured against.
 */
export async function setMacroTargets(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = macroTargetsSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .insert(macroTargets)
    .values({ userId, ...parsed.data })
    .onConflictDoUpdate({
      target: [macroTargets.userId, macroTargets.effectiveFrom],
      // $onUpdate doesn't fire on the conflict path, so bump updatedAt explicitly.
      set: { ...parsed.data, updatedAt: new Date() },
    })
  revalidateMeals()
  return { ok: true }
}

export type DeleteMacroTargetResult =
  { ok: true; period: MacroTargets | null } | { ok: false; error: string }

/**
 * Remove one target period. Deleting the period that started today makes the previous
 * one apply again — which is why this is offered with an undo rather than a confirm:
 * opening a period on the wrong date is now possible, and easily reversed.
 */
export async function deleteMacroTargetPeriod(
  id: unknown,
): Promise<DeleteMacroTargetResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  const [deleted] = await db
    .delete(macroTargets)
    .where(
      and(eq(macroTargets.id, parsed.data), eq(macroTargets.userId, userId)),
    )
    .returning()
  revalidateMeals()
  return { ok: true, period: deleted ?? null }
}

/** Undo for {@link deleteMacroTargetPeriod}. Column list + test live in restore.ts. */
export async function restoreMacroTargetPeriod(
  period: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = restoreMacroTargetSchema.safeParse(period)
  if (!parsed.success) return invalid(parsed.error)
  await db
    .insert(macroTargets)
    .values(restorableMacroTarget(parsed.data, userId))
    .onConflictDoNothing()
  revalidateMeals()
  return { ok: true }
}
