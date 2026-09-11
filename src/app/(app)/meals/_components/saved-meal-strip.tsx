"use client"

import * as React from "react"
import { Utensils } from "lucide-react"
import { toast } from "sonner"

import { deleteMealEntries, logSavedMeal } from "@/modules/meals/actions"
import type { SavedMeal } from "@/modules/meals/queries"
import { sumMacros } from "@/modules/meals/service"

/**
 * One-tap chips of the user's saved meals (T32, ADR-0026). Each logs every item of the
 * meal onto the viewed `date` in one insert, under the meal's own meal type or the
 * quick-add default. The toast's Undo removes exactly the rows that were added — the
 * copy-a-day arrangement, for the same reason: several entries went in, and "delete the
 * last one" would be the wrong undo.
 *
 * Above the recent-foods strip, and only once a meal exists: the page must not grow a
 * row of chrome for a feature nobody has used yet.
 */
export function SavedMealStrip({
  date,
  meals,
}: {
  date: string
  /** Items already resolved against the library, so the chip's kcal is what a tap logs. */
  meals: SavedMeal[]
}) {
  const [pending, startTransition] = React.useTransition()

  if (meals.length === 0) return null

  function log(meal: SavedMeal) {
    startTransition(async () => {
      const result = await logSavedMeal({ id: meal.id, date })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const ids = result.entryIds
      toast(`Logged ${result.name}`, {
        description: `${result.count} ${result.count === 1 ? "item" : "items"}`,
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undone = await deleteMealEntries(ids)
              if (!undone.ok) toast.error(undone.error)
            }),
        },
      })
    })
  }

  return (
    <div
      role="group"
      aria-label="Saved meals"
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {meals.map((meal) => (
        <button
          key={meal.id}
          type="button"
          disabled={pending}
          onClick={() => log(meal)}
          className="bg-card hover:bg-accent flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
        >
          {/* The one thing that tells a meal chip from a food chip at a glance. */}
          <Utensils className="text-muted-foreground size-3.5" aria-hidden />
          <span className="max-w-40 truncate">{meal.name}</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {Math.round(sumMacros(meal.items).calories)} kcal
          </span>
        </button>
      ))}
    </div>
  )
}
