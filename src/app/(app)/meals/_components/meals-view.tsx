"use client"

import * as React from "react"
import Link from "next/link"
import { LinkPending } from "@/components/shared/link-pending"
import {
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  Library,
  Plus,
  Target,
  MoreVertical,
  Utensils,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  deleteMealEntry,
  logMeal,
  restoreMealEntry,
} from "@/modules/meals/actions"
import type {
  BodyWeight,
  Food,
  MacroTargets,
  MealEntry,
  SavedMeal,
  WaterLog,
} from "@/modules/meals/queries"
import {
  groupByMealType,
  itemsFromEntries,
  macroProgress,
  type QuickPickFood,
  sumMacros,
  sumMicros,
  type WeightReadout,
} from "@/modules/meals/service"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DateJumpButton } from "@/components/shared/date-jump-button"

import { CopyDayDialog } from "./copy-day-dialog"
import { DayExtras } from "./day-extras"
import { FoodManager } from "./food-manager"
import { LogFoodDialog } from "./log-food-dialog"
import { MacroSummary } from "./macro-summary"
import { MealEntryItem } from "./meal-entry-item"
import { MealQuickAdd } from "./meal-quick-add"
import { QuickPickStrip } from "./quick-pick-strip"
import {
  EMPTY_DRAFT,
  SavedMealDialog,
  type SavedMealDraft,
} from "./saved-meal-dialog"
import { SavedMealStrip } from "./saved-meal-strip"
import { SavedMealsDialog } from "./saved-meals-dialog"
import { TargetsDialog } from "./targets-dialog"
import { useDateLocale } from "@/components/preferences/preferences-provider"

function shiftDate(date: string, delta: number): string {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + delta))
    .toISOString()
    .slice(0, 10)
}

function formatDay(date: string, today: string, locale: string): string {
  if (date === today) return "Today"
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, {
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
  targetHistory,
  quickPicks,
  savedMeals,
  waterLogs,
  trackWeight,
  weight,
  weightReadout,
  weightTrend,
  offEnabled,
}: {
  date: string
  today: string
  entries: MealEntry[]
  foods: Food[]
  /** The targets in effect on `date` — not necessarily the most recent ones. */
  targets: MacroTargets | null
  targetHistory: MacroTargets[]
  quickPicks: QuickPickFood[]
  /** Items already resolved against the library — see page.tsx. */
  savedMeals: SavedMeal[]
  waterLogs: WaterLog[]
  /** Off hides the weigh-in card and the trend; `weight` and `weightTrend` arrive empty. */
  trackWeight: boolean
  weight: BodyWeight | null
  weightReadout: WeightReadout | null
  /** Server-rendered on the page and passed in, so its chart isn't pulled client-side. */
  weightTrend: React.ReactNode
  /** Server-read: whether the Open Food Facts integration is on for this install. */
  offEnabled: boolean
}) {
  const locale = useDateLocale()
  const [logOpen, setLogOpen] = React.useState(false)
  const [editingEntry, setEditingEntry] = React.useState<MealEntry | null>(null)
  const [foodsOpen, setFoodsOpen] = React.useState(false)
  const [targetsOpen, setTargetsOpen] = React.useState(false)
  const [copyOpen, setCopyOpen] = React.useState(false)
  const [savedOpen, setSavedOpen] = React.useState(false)
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editorDraft, setEditorDraft] =
    React.useState<SavedMealDraft>(EMPTY_DRAFT)
  /**
   * Bumped on every open of the saved-meal editor and used as its `key`, so it mounts
   * fresh from the draft each time — its fields are plain state seeded from props, and
   * a remount is the honest way to reseed them (no effect, no reset call).
   */
  const [editorSession, setEditorSession] = React.useState(0)
  const [isPending, startTransition] = React.useTransition()
  /**
   * Which entry's "Log again" is in flight, or null.
   *
   * Per-id and DERIVED, the pattern `use-log-habit.ts` documents: a shared boolean would
   * put a spinner on every row's button at once, and "Log again" renders on every entry.
   * Derived from the transition rather than tracked separately so it cannot get stuck if
   * the action throws.
   */
  const [relogTarget, setRelogTarget] = React.useState<string | null>(null)
  const relogId = isPending ? relogTarget : null

  const totals = sumMacros(entries)
  const progress = macroProgress(totals, targets)
  const micros = sumMicros(entries)
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
    setRelogTarget(entry.id)
    startTransition(async () => {
      const result = await logMeal({
        name: entry.name,
        servingLabel: entry.servingLabel,
        calories: entry.calories,
        proteinG: entry.proteinG,
        carbsG: entry.carbsG,
        fatG: entry.fatG,
        // Micros included: "Log again" means log THIS entry again, and omitting them
        // would quietly produce a copy with its fiber and sodium stripped out.
        fiberG: entry.fiberG,
        sugarG: entry.sugarG,
        satFatG: entry.satFatG,
        sodiumMg: entry.sodiumMg,
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

  /** One editor for every way in: a section's "Save as meal", the list's Edit, or New. */
  function openSavedMealEditor(draft: SavedMealDraft) {
    setEditorDraft(draft)
    setEditorSession((session) => session + 1)
    setSavedOpen(false)
    setEditorOpen(true)
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Meals
          </h1>
        </div>
        <div className="flex gap-2">
          {/* One named menu instead of a row of bare icons — see the note on /activity. A
              phone has no hover, so the glyph is all you get, and none of these is guessable
              from it. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Meals actions"
                />
              }
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setCopyOpen(true)}>
                <CopyPlus className="size-4" />
                Copy a day
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFoodsOpen(true)}>
                <Library className="size-4" />
                Food library
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSavedOpen(true)}>
                <Utensils className="size-4" />
                Saved meals
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTargetsOpen(true)}>
                <Target className="size-4" />
                Set targets
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          {/* Same-route param change: the segment is not remounted, so `loading.tsx`
              never fires and nothing else in the app indicates this. */}
          <LinkPending className="size-4">
            <ChevronLeft className="size-4" />
          </LinkPending>
        </Link>
        <span className="min-w-28 text-center text-sm font-medium">
          {formatDay(date, today, locale)}
        </span>
        <Link
          href={`/meals?date=${shiftDate(date, 1)}`}
          aria-label="Next day"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <LinkPending className="size-4">
            <ChevronRight className="size-4" />
          </LinkPending>
        </Link>
        <DateJumpButton
          selected={date}
          hrefFor={(d) => `/meals?date=${d}`}
          ariaLabel="Jump to a day"
        />
        {date !== today && (
          <Link
            href="/meals"
            className={cn(buttonVariants({ variant: "link", size: "sm" }))}
          >
            Today
          </Link>
        )}
      </div>

      <MacroSummary progress={progress} micros={micros} />

      <DayExtras
        date={date}
        waterLogs={waterLogs}
        trackWeight={trackWeight}
        weight={weight}
        readout={weightReadout}
      />

      {/* Directly under the card that feeds it, not after the meal log. It sat at the
          foot of the page until T29, below every entry of the day, which is how several
          weigh-ins could be logged without the trend ever being seen. */}
      {weightTrend}

      <div className="mt-4 flex flex-col gap-3">
        <MealQuickAdd date={date} foods={foods} />
        {/* Saved meals before recent foods: a meal is something you chose to keep. */}
        <SavedMealStrip date={date} meals={savedMeals} />
        <QuickPickStrip date={date} picks={quickPicks} />
      </div>

      <div className="mt-6 flex flex-col gap-5">
        {groups.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            <p>Nothing logged for this day.</p>
            {/* An empty day is exactly when copying one is worth knowing about, and the
                toolbar icon alone doesn't say so. */}
            <button
              type="button"
              onClick={() => setCopyOpen(true)}
              className="text-foreground mt-1 underline underline-offset-4"
            >
              Copy from another day
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.mealType}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{group.label}</h2>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {Math.round(group.totals.calories)} kcal
                  </span>
                  {/* Beside the section's total, not in the ⋮ menu: the thing being
                      saved is THIS breakfast, and the control belongs next to it. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground h-7 px-2 text-xs"
                    onClick={() =>
                      openSavedMealEditor({
                        // "Other" is not a name anyone would give a meal.
                        name: group.mealType === "other" ? "" : group.label,
                        mealType:
                          group.mealType === "other" ? "" : group.mealType,
                        items: itemsFromEntries(group.entries),
                      })
                    }
                  >
                    <BookmarkPlus className="size-3.5" />
                    Save as meal
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {group.entries.map((entry) => (
                  <MealEntryItem
                    key={entry.id}
                    entry={entry}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onRelog={handleRelog}
                    relogging={relogId === entry.id}
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
        quickPicks={quickPicks}
        entry={editingEntry}
        offEnabled={offEnabled}
        open={logOpen}
        onOpenChange={setLogOpen}
      />
      <CopyDayDialog
        date={date}
        existingCount={entries.length}
        open={copyOpen}
        onOpenChange={setCopyOpen}
      />
      <FoodManager
        foods={foods}
        offEnabled={offEnabled}
        open={foodsOpen}
        onOpenChange={setFoodsOpen}
      />
      <TargetsDialog
        targets={targets}
        history={targetHistory}
        date={date}
        open={targetsOpen}
        onOpenChange={setTargetsOpen}
      />
      <SavedMealsDialog
        meals={savedMeals}
        open={savedOpen}
        onOpenChange={setSavedOpen}
        onNew={() => openSavedMealEditor(EMPTY_DRAFT)}
        onEdit={(meal) =>
          openSavedMealEditor({
            id: meal.id,
            name: meal.name,
            mealType: meal.mealType ?? "",
            items: meal.items,
          })
        }
      />
      <SavedMealDialog
        key={editorSession}
        draft={editorDraft}
        foods={foods}
        quickPicks={quickPicks}
        offEnabled={offEnabled}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
    </div>
  )
}
