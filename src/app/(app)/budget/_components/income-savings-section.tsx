// Where the month's income came from, and how much of it survived. A SERVER
// component, passed into the client BudgetView as a prop.

import { cn } from "@/lib/utils"
import { accentForKey } from "@/lib/colors"
import type { Category } from "@/modules/budget/queries"
import {
  formatCents,
  savingsRate,
  type MonthSummary,
} from "@/modules/budget/service"

export function IncomeSavingsSection({
  summary,
  categories,
  currency,
}: {
  summary: MonthSummary
  categories: Category[]
  currency: string
}) {
  // Nothing earned means nothing to say — the month's totals already cover spend.
  if (summary.incomeCents <= 0) return null

  const money = (cents: number) => formatCents(cents, currency)
  const rate = savingsRate(summary)
  const rows = [...summary.incomeByCategory].sort(
    (a, b) => b.earnedCents - a.earnedCents,
  )
  const nameOf = (categoryId: string | null) =>
    categoryId == null
      ? "Uncategorized"
      : (categories.find((c) => c.id === categoryId)?.name ?? "Uncategorized")

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold">Income &amp; savings</h2>

      <div className="rounded-xl border">
        <div className="flex items-end justify-between gap-4 border-b p-4">
          <div>
            <div className="text-muted-foreground text-xs">Kept this month</div>
            <div
              className={cn(
                "text-2xl font-semibold tabular-nums",
                summary.netCents < 0
                  ? "text-destructive"
                  : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {money(summary.netCents)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-muted-foreground text-xs">Savings rate</div>
            <div
              className={cn(
                "text-2xl font-semibold tabular-nums",
                rate != null && rate < 0 && "text-destructive",
              )}
            >
              {/* Null only when income is 0, which we've already returned on. */}
              {rate == null ? "—" : `${Math.round(rate * 100)}%`}
            </div>
          </div>
        </div>

        <ul className="divide-y">
          {rows.map((row) => {
            const accent = accentForKey(row.categoryId ?? "__uncat__")
            const share = Math.round(
              (row.earnedCents / summary.incomeCents) * 100,
            )
            return (
              <li
                key={row.categoryId ?? "__uncat__"}
                className="flex flex-col gap-1.5 p-3"
              >
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <span
                      className={cn("size-2 shrink-0 rounded-full", accent.bar)}
                    />
                    <span className="truncate">{nameOf(row.categoryId)}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {money(row.earnedCents)}
                    <span className="text-muted-foreground/70">
                      {" "}
                      · {share}%
                    </span>
                  </span>
                </div>
                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    className={cn("h-full rounded-full", accent.bar)}
                    style={{ width: `${Math.max(2, share)}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
