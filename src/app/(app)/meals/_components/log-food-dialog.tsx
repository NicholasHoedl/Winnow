"use client"

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { logMeal, updateMealEntry } from "@/modules/meals/actions"
import type { Food, MealEntry } from "@/modules/meals/queries"
import { MEAL_TYPES, type MealType } from "@/modules/meals/service"
import { mealEntryInputSchema } from "@/modules/meals/validation"
import { numberField } from "@/lib/forms"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const NEW_FOOD = "__new__"
const NO_MEAL = "__none__"

// Date is supplied by the current day, not the form.
const formSchema = mealEntryInputSchema.omit({ date: true })

type LogFormValues = {
  foodId?: string
  name: string
  servingLabel: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  servings: number
  mealType?: "" | MealType
  saveToLibrary?: boolean
}

const EMPTY: LogFormValues = {
  foodId: "",
  name: "",
  servingLabel: "",
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  servings: 1,
  mealType: "",
  saveToLibrary: true,
}

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
}

export function LogFoodDialog({
  date,
  foods,
  entry,
  open,
  onOpenChange,
}: {
  date: string
  foods: Food[]
  entry: MealEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!entry
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LogFormValues>({
    resolver: standardSchemaResolver(formSchema),
    defaultValues: EMPTY,
  })

  React.useEffect(() => {
    if (!open) return
    if (entry) {
      reset({
        foodId: entry.foodId ?? "",
        name: entry.name,
        servingLabel: entry.servingLabel,
        calories: entry.calories,
        proteinG: entry.proteinG,
        carbsG: entry.carbsG,
        fatG: entry.fatG,
        servings: entry.servings,
        mealType: entry.mealType ?? "",
        saveToLibrary: false,
      })
    } else {
      reset(EMPTY)
    }
  }, [open, entry, reset])

  function onPickFood(value: string | null) {
    if (!value || value === NEW_FOOD) {
      setValue("foodId", "")
      return
    }
    const food = foods.find((f) => f.id === value)
    if (!food) return
    setValue("foodId", food.id)
    setValue("name", food.name)
    setValue("servingLabel", food.servingLabel)
    setValue("calories", food.calories)
    setValue("proteinG", food.proteinG)
    setValue("carbsG", food.carbsG)
    setValue("fatG", food.fatG)
    setValue("saveToLibrary", false)
  }

  const onSubmit = handleSubmit(async (data) => {
    const payload = { ...data, date: isEdit ? entry.date : date }
    const result = isEdit
      ? await updateMealEntry(entry.id, payload)
      : await logMeal(payload)

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof LogFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? "Entry updated" : "Logged")
    onOpenChange(false)
  })

  const foodId = watch("foodId")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit entry" : "Log food"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this logged item." : "Add a food to the day's log."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <FieldGroup>
            {!isEdit && foods.length > 0 && (
              <Field>
                <FieldLabel>From library</FieldLabel>
                <Select defaultValue={NEW_FOOD} onValueChange={onPickFood}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value) =>
                        value && value !== NEW_FOOD
                          ? (foods.find((f) => f.id === value)?.name ?? "New food…")
                          : "New food…"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_FOOD}>New food…</SelectItem>
                    {foods.map((food) => (
                      <SelectItem key={food.id} value={food.id}>
                        {food.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="l-name">Food</FieldLabel>
              <Input id="l-name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="l-serv">Serving</FieldLabel>
                <Input id="l-serv" placeholder="e.g. 100 g" {...register("servingLabel")} />
                <FieldError errors={[errors.servingLabel]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="l-servings">Servings</FieldLabel>
                <Input
                  id="l-servings"
                  type="number"
                  step="any"
                  {...register("servings", numberField)}
                />
                <FieldError errors={[errors.servings]} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="l-cal">Calories</FieldLabel>
                <Input
                  id="l-cal"
                  type="number"
                  step="any"
                  {...register("calories", numberField)}
                />
                <FieldError errors={[errors.calories]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="l-pro">Protein (g)</FieldLabel>
                <Input
                  id="l-pro"
                  type="number"
                  step="any"
                  {...register("proteinG", numberField)}
                />
                <FieldError errors={[errors.proteinG]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="l-carb">Carbs (g)</FieldLabel>
                <Input
                  id="l-carb"
                  type="number"
                  step="any"
                  {...register("carbsG", numberField)}
                />
                <FieldError errors={[errors.carbsG]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="l-fat">Fat (g)</FieldLabel>
                <Input
                  id="l-fat"
                  type="number"
                  step="any"
                  {...register("fatG", numberField)}
                />
                <FieldError errors={[errors.fatG]} />
              </Field>
            </div>

            <Field>
              <FieldLabel>Meal</FieldLabel>
              <Controller
                control={control}
                name="mealType"
                render={({ field }) => (
                  <Select
                    value={field.value ? field.value : NO_MEAL}
                    onValueChange={(value) =>
                      field.onChange(value && value !== NO_MEAL ? (value as MealType) : "")
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value) => MEAL_LABELS[value as MealType] ?? "No meal"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_MEAL}>No meal</SelectItem>
                      {MEAL_TYPES.map((mealType) => (
                        <SelectItem key={mealType} value={mealType}>
                          {MEAL_LABELS[mealType]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            {!isEdit && !foodId && (
              <Controller
                control={control}
                name="saveToLibrary"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    Save as a new food in my library
                  </label>
                )}
              />
            )}
          </FieldGroup>

          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save" : "Log"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
