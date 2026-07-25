"use client"

import * as React from "react"
import { toast } from "sonner"

import { logMeal } from "@/modules/meals/actions"
import type { QuickPickFood } from "@/modules/meals/service"

/**
 * One-tap chips of the user's most recent/frequent foods. Each logs a single serving
 * (no meal type) to the viewed `date` — a fast "I ate this."
 */
export function QuickPickStrip({
  date,
  picks,
}: {
  date: string
  picks: QuickPickFood[]
}) {
  const [pending, startTransition] = React.useTransition()

  if (picks.length === 0) return null

  function log(pick: QuickPickFood) {
    startTransition(async () => {
      const result = await logMeal({
        name: pick.name,
        servingLabel: pick.servingLabel,
        calories: pick.calories,
        proteinG: pick.proteinG,
        carbsG: pick.carbsG,
        fatG: pick.fatG,
        servings: 1,
        mealType: "",
        date,
        foodId: pick.foodId ?? "",
        saveToLibrary: false,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Logged ${pick.name}`)
    })
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {picks.map((pick) => (
        <button
          key={pick.key}
          type="button"
          disabled={pending}
          onClick={() => log(pick)}
          className="bg-card hover:bg-accent flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
        >
          <span className="max-w-40 truncate">{pick.name}</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {Math.round(pick.calories)} kcal
          </span>
        </button>
      ))}
    </div>
  )
}
