"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  createFood,
  deleteFood,
  restoreFood,
  updateFood,
} from "@/modules/meals/actions"
import type { ImportedFood } from "@/modules/meals/off-mapping"
import type { Food } from "@/modules/meals/queries"
import { foodInputSchema } from "@/modules/meals/validation"
import { numberField } from "@/lib/forms"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { FoodDatabaseSearch } from "./food-database-search"
import { NutritionExtraFields } from "./nutrition-extra-fields"

type FoodFormValues = {
  name: string
  servingLabel: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG?: number | null
  sugarG?: number | null
  satFatG?: number | null
  sodiumMg?: number | null
  // Carried so an imported product keeps its barcode; there is no visible field for it.
  barcode?: string | null
}

// Macros default to 0 (a hand-entered food has all four on screen); micros default to
// null, because "not filled in" and "measured as zero" are different facts.
const EMPTY: FoodFormValues = {
  name: "",
  servingLabel: "",
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: null,
  sugarG: null,
  satFatG: null,
  sodiumMg: null,
  barcode: null,
}

export function FoodManager({
  foods,
  offEnabled,
  open,
  onOpenChange,
}: {
  foods: Food[]
  /** Whether the Open Food Facts integration is switched on for this install. */
  offEnabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = React.useTransition()
  // The one form does double duty: null = "add a new food", a row = "edit that food".
  const [editing, setEditing] = React.useState<Food | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FoodFormValues>({
    resolver: standardSchemaResolver(foodInputSchema),
    defaultValues: EMPTY,
  })

  // Load the row being edited into the form, or empty it. (The edit target is cleared
  // in the dialog's onOpenChange below — an event handler, which is where a reset like
  // this belongs; doing it in this effect would cascade an extra render.)
  React.useEffect(() => {
    if (!open) return
    reset(
      editing
        ? {
            name: editing.name,
            servingLabel: editing.servingLabel,
            calories: editing.calories,
            proteinG: editing.proteinG,
            carbsG: editing.carbsG,
            fatG: editing.fatG,
            fiberG: editing.fiberG,
            sugarG: editing.sugarG,
            satFatG: editing.satFatG,
            sodiumMg: editing.sodiumMg,
            // Loaded and resubmitted even though nothing shows it: updateFood does
            // `.set(parsed.data)`, so omitting it would unlink an imported food from
            // its product the first time someone edited a typo in the name.
            barcode: editing.barcode,
          }
        : EMPTY,
    )
  }, [open, editing, reset])

  /** Prefill from a food-database result. Writes nothing — the form's submit does. */
  function onPickImported(food: ImportedFood) {
    reset({
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
    })
  }

  const onSubmit = handleSubmit(async (data) => {
    const result = editing
      ? await updateFood(editing.id, data)
      : await createFood(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof FoodFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    // Editing only rewrites the library row. Meal entries snapshot their macros at
    // log time, so past days keep the numbers they were actually logged with.
    toast.success(editing ? "Food updated" : "Food added")
    setEditing(null)
    reset(EMPTY)
  })

  // A deleted food is re-insertable, so offer undo rather than a confirm prompt.
  // (Past meal entries keep their macro snapshot regardless — only the reusable
  // library row is affected.)
  function remove(food: Food) {
    startTransition(async () => {
      const result = await deleteFood(food.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.food ?? food
      toast("Food deleted", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await restoreFood(restorable)
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-edit shouldn't leave the form pre-filled for the next open —
        // the row may not even exist by then.
        if (!next) setEditing(null)
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Food library</DialogTitle>
          <DialogDescription>
            {editing
              ? "Editing a library food. Meals you've already logged keep the macros they were logged with."
              : "Reusable foods with their per-serving macros."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <FieldGroup>
            {/* Import fills the form; "Add food" below is still what writes the row, so
                the values can be corrected first — the database is often wrong. */}
            {!editing && (
              <FoodDatabaseSearch
                enabled={offEnabled}
                onPick={onPickImported}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field className="col-span-2">
                <FieldLabel htmlFor="f-name">Name</FieldLabel>
                <Input id="f-name" {...register("name")} />
                <FieldError errors={[errors.name]} />
              </Field>
              <Field className="col-span-2">
                <FieldLabel htmlFor="f-serv">Serving</FieldLabel>
                <Input
                  id="f-serv"
                  placeholder="e.g. 100 g, 1 cup"
                  {...register("servingLabel")}
                />
                <FieldError errors={[errors.servingLabel]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="f-cal">Calories</FieldLabel>
                <Input
                  id="f-cal"
                  type="number"
                  step="any"
                  {...register("calories", numberField)}
                />
                <FieldError errors={[errors.calories]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="f-pro">Protein (g)</FieldLabel>
                <Input
                  id="f-pro"
                  type="number"
                  step="any"
                  {...register("proteinG", numberField)}
                />
                <FieldError errors={[errors.proteinG]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="f-carb">Carbs (g)</FieldLabel>
                <Input
                  id="f-carb"
                  type="number"
                  step="any"
                  {...register("carbsG", numberField)}
                />
                <FieldError errors={[errors.carbsG]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="f-fat">Fat (g)</FieldLabel>
                <Input
                  id="f-fat"
                  type="number"
                  step="any"
                  {...register("fatG", numberField)}
                />
                <FieldError errors={[errors.fatG]} />
              </Field>
            </div>
            <NutritionExtraFields
              register={register}
              errors={errors}
              idPrefix="f"
            />
            <div className="flex gap-2">
              {editing && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {editing ? `Save “${editing.name}”` : "Add food"}
              </Button>
            </div>
          </FieldGroup>
        </form>

        <div className="mt-2 max-h-56 overflow-y-auto">
          <ul className="flex flex-col gap-1">
            {foods.length === 0 ? (
              // "No foods yet." on its own restated the wall this tranche exists to
              // remove — it told you the library was empty and left you to type. Point
              // at the two ways to fill it that now sit directly above.
              <li className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
                Your library is empty.{" "}
                {offEnabled
                  ? "Search the food database above, scan a barcode, or add one by hand."
                  : "Add one by hand above."}
              </li>
            ) : (
              foods.map((food) => (
                <li
                  key={food.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="block truncate font-medium">
                      {food.name}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {food.servingLabel} · {Math.round(food.calories)} kcal
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${food.name}`}
                      onClick={() => setEditing(food)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${food.name}`}
                      disabled={pending}
                      onClick={() => remove(food)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}
