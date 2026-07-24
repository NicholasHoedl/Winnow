import { z } from "zod"

import { isValidDateString } from "@/lib/date"

import { MEAL_TYPES } from "./service"

// Form number inputs use `valueAsNumber`, so values arrive as numbers already.
const macroNumber = z.number().min(0, "Must be 0 or more").max(100000)

export const foodInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  servingLabel: z.string().trim().min(1, "Serving is required").max(100),
  calories: macroNumber,
  proteinG: macroNumber,
  carbsG: macroNumber,
  fatG: macroNumber,
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
  servings: z.number().positive("Servings must be more than 0").max(10000),
  mealType: z.enum(MEAL_TYPES).or(z.literal("")).optional(),
  date: z.string().refine((value) => isValidDateString(value), "Enter a valid date"),
  foodId: z.string().uuid().or(z.literal("")).optional(),
  saveToLibrary: z.boolean().optional(),
})
export type MealEntryInput = z.infer<typeof mealEntryInputSchema>

export const macroTargetsSchema = z.object({
  calories: macroNumber,
  proteinG: macroNumber,
  carbsG: macroNumber,
  fatG: macroNumber,
})
export type MacroTargetsInput = z.infer<typeof macroTargetsSchema>
