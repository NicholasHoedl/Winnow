import { z } from "zod"

import { isValidDateString } from "@/lib/date"

import { MEAL_TYPES } from "./service"

// Form number inputs use `valueAsNumber`, so values arrive as numbers already.
const macroNumber = z.number().min(0, "Must be 0 or more").max(100000)

/**
 * A micronutrient: a number, or null for "unknown" — see the schema comment for why
 * that isn't 0. `.nullable().optional()` rather than just nullable because
 * foodInputSchema is shared by two RHF resolvers (the library form and, through
 * mealEntryInputSchema, the log dialog); a required key would break both forms'
 * inferred types, and a form that omits the field must leave the column untouched.
 */
const microNumber = z
  .number()
  .min(0, "Must be 0 or more")
  .max(100000)
  .nullable()
  .optional()

// Optional so the library form, which has no barcode field, doesn't clear an imported
// food's barcode on edit (drizzle's .set() skips undefined).
const barcodeField = z.string().trim().max(32).nullable().optional()

const microFields = {
  fiberG: microNumber,
  sugarG: microNumber,
  satFatG: microNumber,
  sodiumMg: microNumber,
}

export const foodInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  servingLabel: z.string().trim().min(1, "Serving is required").max(100),
  calories: macroNumber,
  proteinG: macroNumber,
  carbsG: macroNumber,
  fatG: macroNumber,
  ...microFields,
  barcode: barcodeField,
})
export type FoodInput = z.infer<typeof foodInputSchema>

export const mealEntryInputSchema = z.object({
  // snapshot of the food at log time
  name: z.string().trim().min(1, "Name is required").max(200),
  servingLabel: z.string().trim().min(1, "Serving is required").max(100),
  calories: macroNumber,
  proteinG: macroNumber,
  carbsG: macroNumber,
  fatG: macroNumber,
  ...microFields,
  // Carried through to the food row when saveToLibrary is set, so an imported product
  // keeps its barcode.
  barcode: barcodeField,
  servings: z.number().positive("Servings must be more than 0").max(10000),
  mealType: z.enum(MEAL_TYPES).or(z.literal("")).optional(),
  date: z
    .string()
    .refine((value) => isValidDateString(value), "Enter a valid date"),
  foodId: z.string().uuid().or(z.literal("")).optional(),
  saveToLibrary: z.boolean().optional(),
})
export type MealEntryInput = z.infer<typeof mealEntryInputSchema>

const dayField = z
  .string()
  .refine((value) => isValidDateString(value), "Enter a valid date")

/** For actions that take a bare date. Exported so none of them settles for `z.string()`. */
export const daySchema = dayField

// Duplicating a whole day onto another one.
export const copyDaySchema = z.object({ from: dayField, to: dayField })

// --- Undo payloads ---
// Every `restoreX` action is a Server Action, which means it is a public RPC endpoint:
// its `row: MealEntry` parameter is a compile-time annotation and nothing more, so an
// unvalidated restore accepts whatever is posted to it. Budget's restoreTransaction was
// given a schema in T3-S11; these are meals catching up.
//
// `userId` and `updatedAt` are deliberately absent — the session supplies the first and
// the column re-stamps the second, so neither is ever taken from the client.
//
// These do NOT double as the restorable-column list; `restore.ts` owns that, and its test
// derives it from the table itself, which is stronger than any list written out by hand.

// Nullable but NOT optional, unlike the form-facing `microNumber`. A form may omit a
// field it doesn't render; an undo payload may not. If a key could go missing here it
// would arrive as `undefined`, drizzle would skip the column, and the restored row would
// come back with a silent NULL — precisely the data loss restore.ts exists to prevent.
const restoredMicro = z.number().min(0).max(100000).nullable()

const restoredMicros = {
  fiberG: restoredMicro,
  sugarG: restoredMicro,
  satFatG: restoredMicro,
  sodiumMg: restoredMicro,
}

export const restoreFoodSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  servingLabel: z.string().trim().min(1).max(100),
  calories: macroNumber,
  proteinG: macroNumber,
  carbsG: macroNumber,
  fatG: macroNumber,
  ...restoredMicros,
  barcode: z.string().trim().max(32).nullable(),
  createdAt: z.coerce.date(),
})

export const restoreMealEntrySchema = z.object({
  id: z.string().uuid(),
  foodId: z.string().uuid().nullable(),
  date: dayField,
  mealType: z.enum(MEAL_TYPES).nullable(),
  servings: z.number().positive().max(10000),
  name: z.string().trim().min(1).max(200),
  servingLabel: z.string().trim().min(1).max(100),
  calories: macroNumber,
  proteinG: macroNumber,
  carbsG: macroNumber,
  fatG: macroNumber,
  ...restoredMicros,
  createdAt: z.coerce.date(),
})

export const restoreWaterLogSchema = z.object({
  id: z.string().uuid(),
  date: dayField,
  // Same bounds as logging one — undo must not be a way around the range check.
  amountFlOz: z.number().positive().max(500),
  createdAt: z.coerce.date(),
})

export const restoreMacroTargetSchema = z.object({
  id: z.string().uuid(),
  effectiveFrom: dayField,
  calories: macroNumber,
  proteinG: macroNumber,
  carbsG: macroNumber,
  fatG: macroNumber,
  createdAt: z.coerce.date(),
})

// --- Water + body weight ---
// The ranges are real, not decorative. A bare .positive() lets a fat-fingered 1855 lb
// through, and one absurd point permanently flattens the weight chart's y-axis.
export const waterLogSchema = z.object({
  date: dayField,
  amountFlOz: z
    .number()
    .positive("Must be more than 0")
    .max(500, "That's more than a gallon in one go"),
})

export const bodyWeightSchema = z.object({
  date: dayField,
  weightLb: z
    .number()
    .min(20, "That looks too low")
    .max(1500, "That looks too high"),
})

// --- Open Food Facts lookups (ADR-0005) ---
// These guard the RPC boundary only. The client re-checks length and barcode shape
// before spending a request, and off-client.ts checks again before building a URL —
// the barcode ends up in a URL path segment, so it is validated more than once on
// purpose.
export const offQuerySchema = z.string().max(200)
export const offBarcodeSchema = z.string().max(32)

export const macroTargetsSchema = z.object({
  calories: macroNumber,
  proteinG: macroNumber,
  carbsG: macroNumber,
  fatG: macroNumber,
  // The day this set of targets starts applying. Saving twice on one day edits that
  // period; saving on a new day opens a new one.
  effectiveFrom: z
    .string()
    .refine((value) => isValidDateString(value), "Enter a valid date"),
})
export type MacroTargetsInput = z.infer<typeof macroTargetsSchema>
