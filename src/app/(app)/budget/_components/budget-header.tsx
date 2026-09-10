import type * as React from "react"

import { BudgetTabs } from "./budget-tabs"
import { MonthNav } from "./month-nav"

/**
 * The frame every Budget page shares: the heading, the page's one primary action beside
 * it, the strip of pills, the month navigation where the page reads a month, and the
 * page's description.
 *
 * Not a `layout.tsx`, for the reason `ActivityHeader` gives: the primary action ("Add" on
 * the ledger) belongs to the page — it opens the page's dialog — and a layout has no way
 * to take it. Each page renders this instead, and its `loading.tsx` renders it too, which
 * is what keeps the heading and the strip still while the content waits.
 *
 * `month` rides on the pills and lights nothing; with `today` as well, the month
 * navigation renders under the strip. Transactions, Budgets and Trends pass both;
 * Categories has no month to read and passes only the one it was reached with, so a
 * round trip through it keeps the month.
 */
export function BudgetHeader({
  action,
  month = null,
  today,
  description,
}: {
  action?: React.ReactNode
  month?: string | null
  today?: string
  description?: React.ReactNode
}) {
  return (
    <header className="mb-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Budget
        </h1>
        {action}
      </div>
      <BudgetTabs month={month} />
      {month && today && (
        <MonthNav month={month} currentMonth={today.slice(0, 7)} />
      )}
      {description && (
        <p className="text-muted-foreground mt-3 text-sm">{description}</p>
      )}
    </header>
  )
}
