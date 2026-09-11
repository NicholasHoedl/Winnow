"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { createFood, saveSavedMeal } from "@/modules/meals/actions"
import type { ImportedFood } from "@/modules/meals/off-mapping"
import type { Food } from "@/modules/meals/queries"
import {
  defaultPortion,
  scaleReferenceFood,
  type ReferenceFood,
} from "@/modules/meals/reference-foods"
import {
  itemFromFood,
  MEAL_LABELS,
  MEAL_TYPES,
  type MealType,
  type QuickPickFood,
  type SavedMealItemInput,
  sumMacros,
} from "@/modules/meals/service"
import {
  type FoodInput,
  savedMealInputSchema,
} from "@/modules/meals/validation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { FoodSearch } from "./food-search"

const NO_MEAL = "__none__"

/**
 * What the editor opens with: a meal to edit (with `id`), a draft built from a section
 * of the day's log (items, no id), or nothing.
 */
export type SavedMealDraft = {
  id?: string
  name: string
  /** "" = wherever quick-added meals go, resolved when the meal is logged. */
  mealType: "" | MealType
  items: SavedMealItemInput[]
}

export const EMPTY_DRAFT: SavedMealDraft = { name: "", mealType: "", items: [] }

/**
 * An item in the editor's list: a key that survives removals above it, and the servings
 * its input was mounted with. The input is uncontrolled (see the field), so its
 * `defaultValue` must not move with the state it feeds — base-ui warns when it does.
 */
type Row = { key: number; seed: number; item: SavedMealItemInput }

/**
 * Build or edit a saved meal (T32, ADR-0026): a name, where it logs to, and the foods in
 * it with their servings. Adding a food uses the same search bar as the Log food dialog;
 * a library pick joins the list as it is, and a reference or packaged pick is saved to
 * the library FIRST and then joins — an item follows its library food, so every food in a
 * meal is a library food.
 *
 * Plain state rather than react-hook-form: the list of items is the form, and the meals
 * page remounts this component (by `key`) on every open, so the fields seed from `draft`
 * once and never need resetting. The schema still has the last word, at submit.
 */
export function SavedMealDialog({
  draft,
  foods,
  quickPicks,
  offEnabled,
  open,
  onOpenChange,
}: {
  draft: SavedMealDraft
  foods: Food[]
  /** The quick-pick ranking, so the search lists what you log most first. */
  quickPicks: QuickPickFood[]
  /** Whether the Open Food Facts integration is switched on for this install. */
  offEnabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = React.useState(draft.name)
  const [mealType, setMealType] = React.useState<"" | MealType>(draft.mealType)
  const [rows, setRows] = React.useState<Row[]>(() =>
    draft.items.map((item, key) => ({ key, seed: item.servings, item })),
  )
  const [nameError, setNameError] = React.useState<string | null>(null)
  const nextKey = React.useRef(draft.items.length)
  const [pending, startTransition] = React.useTransition()

  const isEdit = draft.id !== undefined
  const title = isEdit
    ? "Edit saved meal"
    : draft.items.length > 0
      ? "Save as meal"
      : "New saved meal"
  const items = rows.map((row) => row.item)
  const totals = sumMacros(items)

  function add(item: SavedMealItemInput) {
    setRows((current) => [
      ...current,
      { key: nextKey.current++, seed: item.servings, item },
    ])
  }

  function setServings(key: number, servings: number) {
    setRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, item: { ...row.item, servings } } : row,
      ),
    )
  }

  function remove(key: number) {
    setRows((current) => current.filter((row) => row.key !== key))
  }

  /** A library food joins as one serving of itself. */
  function onPickFood(food: Food) {
    add(itemFromFood(food))
  }

  /**
   * A reference or packaged pick is added to the library first, then to the meal, so the
   * item can follow it from now on — the same choice quick add makes when it falls
   * through to the reference foods.
   */
  function addToLibrary(input: FoodInput) {
    startTransition(async () => {
      const result = await createFood(input)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      add(itemFromFood(result.food))
      toast.success(`Added ${result.food.name} to your library`)
    })
  }

  function onPickReference(food: ReferenceFood) {
    addToLibrary({
      ...scaleReferenceFood(food, defaultPortion(food)),
      barcode: null,
    })
  }

  function onPickImported(food: ImportedFood) {
    addToLibrary({
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

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = savedMealInputSchema.safeParse({
      id: draft.id,
      name,
      mealType,
      items,
    })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      if (issue?.path[0] === "name") {
        setNameError(issue.message)
      } else {
        toast.error(issue?.message ?? "Check the meal and try again.")
      }
      return
    }
    setNameError(null)
    startTransition(async () => {
      const result = await saveSavedMeal(parsed.data)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        isEdit ? "Saved meal updated" : `Saved “${parsed.data.name}”`,
      )
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Foods logged together in one tap, with the servings you set here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="sm-name">Name</FieldLabel>
              <Input
                id="sm-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Weekday breakfast"
              />
              <FieldError
                errors={[nameError ? { message: nameError } : undefined]}
              />
            </Field>

            <Field>
              <FieldLabel>Logs to</FieldLabel>
              <Select
                value={mealType ? mealType : NO_MEAL}
                onValueChange={(value) =>
                  setMealType(
                    value && value !== NO_MEAL ? (value as MealType) : "",
                  )
                }
              >
                <SelectTrigger className="w-full" aria-label="Logs to">
                  <SelectValue>
                    {(value) =>
                      MEAL_LABELS[value as MealType] ??
                      "Wherever quick-added meals go"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MEAL}>
                    Wherever quick-added meals go
                  </SelectItem>
                  {MEAL_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {MEAL_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Foods</FieldLabel>
              {rows.length === 0 ? (
                <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
                  Nothing in this meal yet. Add a food below.
                </p>
              ) : (
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {rows.map(({ key, seed, item }) => (
                    <li
                      key={key}
                      className="flex items-center gap-2 rounded-md border p-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {item.name}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {item.servingLabel} ·{" "}
                          {Math.round(item.calories * item.servings)} kcal
                        </span>
                      </div>
                      {/* Uncontrolled: a controlled number field loses the "." of "1."
                          the moment it fails to parse. Parsed on change, taken when it
                          is a number, and the schema refuses 0 at submit. */}
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        className="w-20"
                        aria-label={`Servings of ${item.name}`}
                        defaultValue={seed}
                        onChange={(event) => {
                          const servings = event.target.valueAsNumber
                          if (Number.isFinite(servings))
                            setServings(key, servings)
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => remove(key)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {rows.length > 0 && (
                <p className="text-muted-foreground text-xs tabular-nums">
                  Total {Math.round(totals.calories)} kcal · P{" "}
                  {Math.round(totals.protein)} g · C {Math.round(totals.carbs)}{" "}
                  g · F {Math.round(totals.fat)} g
                </p>
              )}
            </Field>

            <Field>
              <FieldLabel>Add a food</FieldLabel>
              <FoodSearch
                foods={foods}
                quickPicks={quickPicks}
                offEnabled={offEnabled}
                onPickFood={onPickFood}
                onPickReference={onPickReference}
                onPickImported={onPickImported}
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save meal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
