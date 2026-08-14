"use client"

import { CopyPlus, MoreVertical, Pencil, Trash2 } from "lucide-react"

import type { MealEntry } from "@/modules/meals/queries"
import { entryTotals } from "@/modules/meals/service"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function formatServings(servings: number): string {
  return Number.isInteger(servings)
    ? String(servings)
    : servings.toFixed(2).replace(/\.?0+$/, "")
}

export function MealEntryItem({
  entry,
  onEdit,
  onDelete,
  onRelog,
  relogging,
}: {
  entry: MealEntry
  onEdit: (entry: MealEntry) => void
  onDelete: (entry: MealEntry) => void
  onRelog: (entry: MealEntry) => void
  /** This row's re-log is in flight. Per-row, so one tap does not spin every button. */
  relogging: boolean
}) {
  const totals = entryTotals(entry)

  return (
    <div className="bg-card flex items-center gap-3 rounded-lg border p-3">
      <button
        type="button"
        onClick={() => onEdit(entry)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-sm font-medium">{entry.name}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {formatServings(entry.servings)} × {entry.servingLabel} ·{" "}
          {Math.round(totals.calories)} kcal
        </span>
      </button>

      <div className="text-muted-foreground hidden text-right text-xs tabular-nums sm:block">
        <div>P {Math.round(totals.protein)}g</div>
        <div>
          C {Math.round(totals.carbs)}g · F {Math.round(totals.fat)}g
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Log again"
        onClick={() => onRelog(entry)}
      >
        {/* Not disabled: a double-log is recoverable and the button is small enough
            that blocking it mid-tap would feel worse than the duplicate. */}
        {relogging ? (
          <Spinner className="size-4" />
        ) : (
          <CopyPlus className="size-4" />
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Entry actions" />
          }
        >
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(entry)}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDelete(entry)}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
