"use client"

import { cn } from "@/lib/utils"
import { accentForKey } from "@/lib/colors"
import type { Category } from "@/modules/budget/queries"
import { formatCents, type MonthSummary } from "@/modules/budget/service"
import { usePreferences } from "@/components/preferences/preferences-provider"

/**
 * How the month is going, category by category: spent against the limit, with a bar.
 *
 * The "By category" block from the ledger page, moved here in T30 so the plan and the
 * actual sit together — this is the page the limits are set on, and the ledger is
 * transactions the way the Tasks page is tasks. The whole month, always: the ledger's
 * filters never narrowed this, and now there is no ledger beside it to confuse it with.
 */
export function CategoryBars({
  summary,
  categories,
}: {
  summary: MonthSummary
  categories: Category[]
}) {
  const { currency } = usePreferences()
  const money = (cents: number) => formatCents(cents, currency)
  const categoryName = (id: string | null) =>
    id == null
      ? "Uncategorized"
      : (categories.find((c) => c.id === id)?.name ?? "Uncategorized")

  // Categories with spend or a budget this month, alphabetized by name.
  const rows = [...summary.byCategory].sort((a, b) =>
    categoryName(a.categoryId).localeCompare(categoryName(b.categoryId)),
  )
  const hasTotal = summary.totalBudgetedCents > 0
  const overTotal =
    hasTotal && summary.expenseCents > summary.totalBudgetedCents

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        Nothing spent or budgeted this month.
      </p>
    )
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">By category</h2>
        {/* The same figure the ledger's stat shows, in the same words, so the two pages
            never disagree about how the month stands. */}
        {hasTotal && (
          <span
            className={cn(
              "text-xs tabular-nums",
              overTotal ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {money(summary.expenseCents)} of {money(summary.totalBudgetedCents)}
            {overTotal
              ? ` · ${money(summary.expenseCents - summary.totalBudgetedCents)} over`
              : ` · ${money(summary.totalBudgetedCents - summary.expenseCents)} left`}
          </span>
        )}
      </div>
      <div className="divide-y rounded-xl border">
        {rows.map((row) => {
          // Keyed by id so a category keeps its colour across months, sorts, and both
          // pages that render it.
          const accent = accentForKey(row.categoryId ?? "__uncat__")
          const hasBudget = row.budgetedCents > 0
          const percent = hasBudget
            ? Math.round((row.spentCents / row.budgetedCents) * 100)
            : 0
          const over = row.remainingCents < 0
          return (
            <div
              key={row.categoryId ?? "__uncat__"}
              className="flex flex-col gap-1.5 p-3"
            >
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <span
                    className={cn("size-2 shrink-0 rounded-full", accent.bar)}
                  />
                  <span className="truncate">
                    {categoryName(row.categoryId)}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {money(row.spentCents)}
                  {hasBudget && (
                    <span className="text-muted-foreground/70">
                      {" "}
                      / {money(row.budgetedCents)}
                    </span>
                  )}
                </span>
              </div>
              {hasBudget && (
                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      over ? "bg-destructive" : accent.bar,
                    )}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
              )}
              {hasBudget && (
                <div
                  className={cn(
                    "text-right text-xs tabular-nums",
                    over ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {over
                    ? `${money(-row.remainingCents)} over`
                    : `${money(row.remainingCents)} left`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
