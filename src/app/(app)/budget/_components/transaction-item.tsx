"use client"

import { CalendarOff, MoreVertical, Pencil, Repeat, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Transaction } from "@/modules/budget/queries"
import { formatCents } from "@/modules/budget/service"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function TransactionItem({
  transaction,
  categoryName,
  onEdit,
  onDelete,
  onStopRepeating,
}: {
  transaction: Transaction
  categoryName: string
  onEdit: (tx: Transaction) => void
  onDelete: (tx: Transaction) => void
  /** Only offered while the rule still exists — deleting it detaches posted rows,
   *  which clears seriesId and takes this menu item away with it. */
  onStopRepeating: (tx: Transaction) => void
}) {
  const { currency } = usePreferences()
  const isIncome = transaction.type === "income"
  const isRepeating = transaction.seriesId !== null
  const payee = transaction.payee?.trim()
  const description = transaction.description?.trim()
  // Payee is the headline when there is one; whatever it displaced moves below.
  const title = payee || description || categoryName
  const details: string[] = []
  if (payee && description) details.push(description)
  if (title !== categoryName) details.push(categoryName)
  details.push(formatDate(transaction.date))
  const subtitle = details.join(" · ")

  return (
    <div className="bg-card flex items-center gap-3 rounded-lg border p-3">
      <button
        type="button"
        onClick={() => onEdit(transaction)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          {isRepeating && (
            <Repeat
              role="img"
              aria-label="Repeating"
              className="text-muted-foreground size-3.5 shrink-0"
            />
          )}
          <span className="truncate">{title}</span>
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {subtitle}
        </span>
      </button>

      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          isIncome
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-foreground",
        )}
      >
        {isIncome ? "+" : "-"}
        {formatCents(transaction.amountCents, currency)}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Transaction actions"
            />
          }
        >
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(transaction)}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          {isRepeating && (
            <DropdownMenuItem onClick={() => onStopRepeating(transaction)}>
              <CalendarOff className="size-4" />
              Stop repeating
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDelete(transaction)}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
