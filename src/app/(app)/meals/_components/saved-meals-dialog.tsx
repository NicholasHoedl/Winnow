"use client"

import * as React from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteSavedMeal, restoreSavedMeal } from "@/modules/meals/actions"
import type { SavedMeal } from "@/modules/meals/queries"
import { MEAL_LABELS, sumMacros } from "@/modules/meals/service"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * The saved meals, listed: edit one, delete one (with undo), start a new one (T32).
 *
 * Building and editing happen in `SavedMealDialog`, which the meals page opens on this
 * dialog's behalf — one editor whether it was reached from here or from "Save as meal"
 * on a section of the day's log, so there is one set of fields to keep right.
 */
export function SavedMealsDialog({
  meals,
  open,
  onOpenChange,
  onNew,
  onEdit,
}: {
  meals: SavedMeal[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onNew: () => void
  onEdit: (meal: SavedMeal) => void
}) {
  const [pending, startTransition] = React.useTransition()

  // A deleted meal is re-insertable, items and all, so offer undo rather than a confirm.
  function remove(meal: SavedMeal) {
    startTransition(async () => {
      const result = await deleteSavedMeal(meal.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.meal ?? meal
      toast(`Deleted “${meal.name}”`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await restoreSavedMeal(restorable)
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Saved meals</DialogTitle>
          <DialogDescription>
            Foods you log together — one tap on the meals page logs every item.
          </DialogDescription>
        </DialogHeader>

        <Button type="button" variant="outline" onClick={onNew}>
          <Plus className="size-4" />
          New meal
        </Button>

        <div className="max-h-72 overflow-y-auto">
          <ul className="flex flex-col gap-1">
            {meals.length === 0 ? (
              <li className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
                No saved meals yet. Log a breakfast, then choose “Save as meal”
                on its heading — or start one here.
              </li>
            ) : (
              meals.map((meal) => {
                const totals = sumMacros(meal.items)
                return (
                  <li
                    key={meal.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="block truncate font-medium">
                        {meal.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {meal.items.length}{" "}
                        {meal.items.length === 1 ? "food" : "foods"} ·{" "}
                        {Math.round(totals.calories)} kcal
                        {meal.mealType && ` · ${MEAL_LABELS[meal.mealType]}`}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${meal.name}`}
                        onClick={() => onEdit(meal)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${meal.name}`}
                        disabled={pending}
                        onClick={() => remove(meal)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}
