"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Library, Plus, Target } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  deleteMealEntry,
  logMeal,
  restoreMealEntry,
} from "@/modules/meals/actions"
import type { Food, MacroTargets, MealEntry } from "@/modules/meals/queries"
import {
  groupByMealType,
  macroProgress,
  type QuickPickFood,
  sumMacros,
} from "@/modules/meals/service"
import { Button, buttonVariants } from "@/components/ui/button"

import { FoodManager } from "./food-manager"
import { LogFoodDialog } from "./log-food-dialog"
import { MacroSummary } from "./macro-summary"
import { MealEntryItem } from "./meal-entry-item"
import { MealQuickAdd } from "./meal-quick-add"
import { QuickPickStrip } from "./quick-pick-strip"
import { TargetsDialog } from "./targets-dialog"

function shiftDate(date: string, delta: number): string {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + delta)).toISOString().slice(0, 10)
}

function formatDay(date: string, today: string): string {
  if (date === today) return "Today"
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function MealsView({
  date,
  today,
  entries,
  foods,
  targets,
  quickPicks,
}: {
  date: string
  today: string
  entries: MealEntry[]
  foods: Food[]
  targets: MacroTargets | null
  quickPicks: QuickPickFood[]
}) {
  const [logOpen, setLogOpen] = React.useState(false)
  const [editingEntry, setEditingEntry] = React.useState<MealEntry | null>(null)
  const [foodsOpen, setFoodsOpen] = React.useState(false)
  const [targetsOpen, setTargetsOpen] = React.useState(false)
  const [, startTransition] = React.useTransition()

  const totals = sumMacros(entries)
  const progress = macroProgress(totals, targets)
  const groups = groupByMealType(entries)

  function handleDelete(entry: MealEntry) {
    startTransition(async () => {
      const result = await deleteMealEntry(entry.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.entry ?? entry
      toast("Entry removed", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await restoreMealEntry(restorable)
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  function handleRelog(entry: MealEntry) {
    startTransition(async () => {
      const result = await logMeal({
        name: entry.name,
        servingLabel: entry.servingLabel,
        calories: entry.calories,
        proteinG: entry.proteinG,
        carbsG: entry.carbsG,
        fatG: entry.fatG,
        servings: entry.servings,
        mealType: entry.mealType ?? "",
        date,
        foodId: entry.foodId ?? "",
        saveToLibrary: false,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Logged ${entry.name}`)
    })
  }

  function openCreate() {
    setEditingEntry(null)
    setLogOpen(true)
  }

  function openEdit(entry: MealEntry) {
    setEditingEntry(entry)
    setLogOpen(true)
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Meals
          </h1>
          <p className="text-muted-foreground text-sm">
            Log what you eat, track your macros.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Food library"
            onClick={() => setFoodsOpen(true)}
          >
            <Library className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Set targets"
            onClick={() => setTargetsOpen(true)}
          >
            <Target className="size-4" />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Log food
          </Button>
        </div>
      </header>

      <div className="mb-4 flex items-center justify-center gap-1">
        <Link
          href={`/meals?date=${shiftDate(date, -1)}`}
          aria-label="Previous day"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ChevronLeft className="size-4" />
        </Link>
        <span className="min-w-28 text-center text-sm font-medium">
          {formatDay(date, today)}
        </span>
        <Link
          href={`/meals?date=${shiftDate(date, 1)}`}
          aria-label="Next day"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ChevronRight className="size-4" />
        </Link>
        {date !== today && (
          <Link
            href="/meals"
            className={cn(buttonVariants({ variant: "link", size: "sm" }))}
          >
            Today
          </Link>
        )}
      </div>

      <MacroSummary progress={progress} />

      <div className="mt-4 flex flex-col gap-3">
        <MealQuickAdd date={date} foods={foods} />
        <QuickPickStrip date={date} picks={quickPicks} />
      </div>

      <div className="mt-6 flex flex-col gap-5">
        {groups.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            Nothing logged for this day.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.mealType}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{group.label}</h2>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {Math.round(group.totals.calories)} kcal
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {group.entries.map((entry) => (
                  <MealEntryItem
                    key={entry.id}
                    entry={entry}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onRelog={handleRelog}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <LogFoodDialog
        date={date}
        foods={foods}
        entry={editingEntry}
        open={logOpen}
        onOpenChange={setLogOpen}
      />
      <FoodManager foods={foods} open={foodsOpen} onOpenChange={setFoodsOpen} />
      <TargetsDialog
        targets={targets}
        open={targetsOpen}
        onOpenChange={setTargetsOpen}
      />
    </div>
  )
}
