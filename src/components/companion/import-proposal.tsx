"use client"

import * as React from "react"
import { AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  resolveCategory,
  uncategorisedCount,
} from "@/modules/companion/service"
import type { ImportPayload } from "@/modules/companion/validation"
import { formatCents } from "@/modules/budget/service"
import { amountToMinor } from "@/modules/budget/service"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

export type CategoryOption = { id: string; name: string }

/**
 * Extracted transactions.
 *
 * **A dense row list, not the spine.** Forty rows on a timeline would be absurd — they
 * are not a sequence you read, they are a table you scan for the two that look wrong.
 * That is the whole reason the shared frame is header + footer + buttons and the body is
 * per-kind.
 *
 * Rows are not editable here, deliberately. The field most likely to be wrong is the
 * category, and the honest answer for a mismatch is not a dropdown on every one of forty
 * rows — it is to land those rows uncategorised, say how many, and let you fix them in
 * `/budget` where the tools already exist. `resolveCategory` never coerces an unmatched
 * guess onto the nearest name, because a wrong category is harder to spot than a missing
 * one.
 */
export function ImportProposal({
  payload,
  categories,
  currency,
  pending,
  onApply,
  onDiscard,
}: {
  payload: ImportPayload
  categories: CategoryOption[]
  currency: string
  pending: boolean
  onApply: (finalized: ImportPayload) => void
  onDiscard: () => void
}) {
  const [excluded, setExcluded] = React.useState<Set<number>>(new Set())

  const final: ImportPayload = {
    rows: payload.rows.filter((_, i) => !excluded.has(i)),
  }
  const unmatched = uncategorisedCount(final.rows, categories)

  function toggle(index: number) {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="bg-card flex flex-col overflow-hidden rounded-xl border lg:min-h-0">
      <div className="border-b p-4">
        <p className="text-brand-accent text-xs font-medium">
          Transactions found
        </p>
        <h2 className="font-medium">
          {payload.rows.length} row{payload.rows.length === 1 ? "" : "s"} read
          from what you pasted
        </h2>
      </div>

      <div className="max-h-[55svh] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
        <ul className="divide-y">
          {payload.rows.map((row, index) => {
            const off = excluded.has(index)
            const category = resolveCategory(row.categoryName, categories)
            return (
              <li
                key={index}
                className={cn(
                  "flex items-center gap-3 px-4 py-2 text-sm",
                  off && "opacity-50",
                )}
              >
                <Checkbox
                  checked={!off}
                  aria-label={`Include ${row.payee}`}
                  onCheckedChange={() => toggle(index)}
                  className="shrink-0"
                />
                <span className="text-muted-foreground shrink-0 font-mono text-xs">
                  {row.date.slice(5)}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    off && "line-through",
                  )}
                >
                  {row.payee}
                </span>
                {category === null ? (
                  <span className="text-brand-accent flex shrink-0 items-center gap-1 text-xs">
                    <AlertTriangle className="size-3" aria-hidden />
                    Uncategorised
                  </span>
                ) : (
                  <span className="text-muted-foreground shrink-0 truncate text-xs">
                    {row.categoryName}
                  </span>
                )}
                <span
                  className={cn(
                    "shrink-0 font-mono text-xs tabular-nums",
                    row.type === "income" ? "text-success" : "text-foreground",
                  )}
                >
                  {row.type === "income" ? "+" : "−"}
                  {formatCents(amountToMinor(row.amount, currency), currency)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="bg-muted/40 flex items-center justify-between gap-3 border-t p-3">
        <p className="text-muted-foreground min-w-0 truncate text-xs">
          Creates{" "}
          <span className="text-foreground font-mono">{final.rows.length}</span>{" "}
          transaction{final.rows.length === 1 ? "" : "s"}
          {unmatched > 0 && (
            <span className="text-brand-accent">
              {" "}
              · <span className="font-mono">{unmatched}</span> uncategorised
            </span>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDiscard}
            disabled={pending}
          >
            Discard
          </Button>
          <Button
            size="sm"
            onClick={() => onApply(final)}
            disabled={pending || final.rows.length === 0}
          >
            {pending ? "Applying…" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  )
}
