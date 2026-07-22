"use client"

import { MoreVertical, Pencil, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Transaction } from "@/modules/budget/queries"
import { formatCents } from "@/modules/budget/service"
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
}: {
  transaction: Transaction
  categoryName: string
  onEdit: (tx: Transaction) => void
  onDelete: (tx: Transaction) => void
}) {
  const isIncome = transaction.type === "income"
  const description = transaction.description?.trim()
  const title = description || categoryName
  const subtitle = description
    ? `${categoryName} · ${formatDate(transaction.date)}`
    : formatDate(transaction.date)

  return (
    <div className="bg-card flex items-center gap-3 rounded-lg border p-3">
      <button
        type="button"
        onClick={() => onEdit(transaction)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-sm font-medium">{title}</span>
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
        {formatCents(transaction.amountCents)}
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
