import Link from "next/link"

import { cn } from "@/lib/utils"
import { accentForKey } from "@/lib/colors"
import type { Category } from "@/modules/budget/queries"
import { formatCents, type MonthSummary } from "@/modules/budget/service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function CategoryBars({
  budget,
  categories,
  currency,
}: {
  budget: MonthSummary
  categories: Category[]
  currency: string
}) {
  const rows = budget.byCategory
    .filter((c) => c.budgetedCents > 0 || c.spentCents > 0)
    .sort((a, b) => b.spentCents - a.spentCents)
    .slice(0, 6)

  const nameOf = (id: string | null) =>
    id == null
      ? "Uncategorized"
      : (categories.find((c) => c.id === id)?.name ?? "Uncategorized")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Categories</span>
          <Link
            href="/budget"
            className="text-muted-foreground hover:text-foreground text-xs font-normal underline-offset-4 hover:underline"
          >
            All →
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No spending or budgets yet this month.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => {
              // Keyed by id, not list position — otherwise a category changes
              // colour as its spend rank moves, and disagrees with /budget.
              const accent = accentForKey(row.categoryId ?? "__uncat__")
              const pct =
                row.budgetedCents > 0
                  ? Math.round((row.spentCents / row.budgetedCents) * 100)
                  : 100
              const over = row.remainingCents < 0 && row.budgetedCents > 0
              return (
                <div key={row.categoryId ?? "__uncat__"}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          accent.bar,
                        )}
                      />
                      <span className="truncate font-medium">
                        {nameOf(row.categoryId)}
                      </span>
                    </span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {formatCents(row.spentCents, currency)}
                      {row.budgetedCents > 0 &&
                        ` / ${formatCents(row.budgetedCents, currency)}`}
                    </span>
                  </div>
                  <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        over ? "bg-destructive" : accent.bar,
                      )}
                      style={{ width: `${Math.max(2, Math.min(pct, 100))}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
