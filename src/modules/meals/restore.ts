// Row → insert-payload mappings for the undo paths, kept OUT of actions.ts so they can
// be tested. Pure: no DB access, only the schema's inferred row types.
//
// Why this exists as its own module: "re-insert the row you just deleted" has silently
// dropped a newly added column twice in this codebase (`842f420` for tasks, T3-S11 for
// transactions). TypeScript can't catch it — a column omitted from an insert is simply
// left NULL, which is valid. So the column list is exported and a test asserts it covers
// every column in the table, which fails the moment someone adds one and forgets this.

import type { foods, macroTargets, mealEntries, waterLogs } from "./schema"

/**
 * Columns deliberately NOT restored, and why:
 * - `updatedAt` has `$onUpdate`, so it re-stamps itself; carrying the old value would
 *   claim the row hasn't been touched since before it was deleted.
 * - `userId` always comes from the session, never from the client-supplied row.
 */
export const NOT_RESTORED = new Set(["updatedAt", "userId"])

// The inputs are the full rows MINUS those two columns. Omitting them from the parameter
// type is what lets the actions hand these functions a Zod-parsed payload directly:
// the undo payload arrives from the browser, so the schemas in validation.ts must not
// accept a `userId` at all, and a type that demanded one would defeat that.
type FoodRow = Omit<typeof foods.$inferSelect, "userId" | "updatedAt">
type MealEntryRow = Omit<typeof mealEntries.$inferSelect, "userId">
type MacroTargetRow = Omit<
  typeof macroTargets.$inferSelect,
  "userId" | "updatedAt"
>
type WaterLogRow = Omit<typeof waterLogs.$inferSelect, "userId">
export type { FoodRow, MacroTargetRow, MealEntryRow, WaterLogRow }

/** Every column of a deleted food, ready to re-insert under the session's user. */
export function restorableFood(food: FoodRow, userId: string) {
  return {
    id: food.id,
    userId,
    name: food.name,
    servingLabel: food.servingLabel,
    calories: food.calories,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
    fiberG: food.fiberG,
    sugarG: food.sugarG,
    satFatG: food.satFatG,
    sodiumMg: food.sodiumMg,
    barcode: food.barcode,
    createdAt: food.createdAt,
  }
}

/**
 * One entry copied onto another day: the same food, the same snapshot, a new row.
 *
 * Derived from {@link restorableMealEntry} rather than listing columns again, so the
 * coverage test that guards that function guards this one too — a nutrition column
 * added later flows into copies without anyone remembering to come back here.
 *
 * `foodId` is preserved on purpose: it is nullable with ON DELETE SET NULL, so keeping
 * it is safe, and it keeps "log again" and the quick-pick ranking working on the copy.
 * The snapshot is copied verbatim and never re-read from the food — the whole point of
 * snapshotting is that yesterday's oatmeal stays yesterday's oatmeal.
 */
export function copiedMealEntry(
  entry: MealEntryRow,
  userId: string,
  date: string,
) {
  // A copy is a new row on a new day: it gets its own id and createdAt.
  const { id, createdAt, ...rest } = restorableMealEntry(entry, userId)
  void [id, createdAt]
  return { ...rest, date }
}

/** Every column of a deleted water log, for its undo toast. */
export function restorableWaterLog(row: WaterLogRow, userId: string) {
  return {
    id: row.id,
    userId,
    date: row.date,
    amountFlOz: row.amountFlOz,
    createdAt: row.createdAt,
  }
}

/** Every column of a deleted target period, for the undo on the targets dialog. */
export function restorableMacroTarget(row: MacroTargetRow, userId: string) {
  return {
    id: row.id,
    userId,
    effectiveFrom: row.effectiveFrom,
    calories: row.calories,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    createdAt: row.createdAt,
  }
}

/** Every column of a deleted meal entry, including the macro + micro snapshot. */
export function restorableMealEntry(entry: MealEntryRow, userId: string) {
  return {
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
    fiberG: entry.fiberG,
    sugarG: entry.sugarG,
    satFatG: entry.satFatG,
    sodiumMg: entry.sodiumMg,
    createdAt: entry.createdAt,
  }
}
