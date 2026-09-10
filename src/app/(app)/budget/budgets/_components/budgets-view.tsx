"use client"

import * as React from "react"

import type { Category } from "@/modules/budget/queries"
import type { MonthSummary } from "@/modules/budget/service"

import { BudgetHeader } from "../../_components/budget-header"
import { BudgetsForm } from "./budgets-form"
import { CategoryBars } from "./category-bars"

/**
 * The Budgets page: how the month stands against its limits, then the limits themselves.
 *
 * Two blocks rather than one table with an editable amount beside each bar. That table
 * is the nicer shape and a follow-up; T30 re-homed what existed rather than redesigning it.
 */
export function BudgetsView({
  month,
  today,
  categories,
  summary,
}: {
  month: string
  today: string
  categories: Category[]
  summary: MonthSummary
}) {
  // The form only needs "what is budgeted per category this month", which the summary
  // already carries — no separate budgets fetch. Memoized so the form's seeding effect
  // doesn't see a new object on every render.
  const budgetedByCategory = React.useMemo(() => {
    const map: Record<string, number> = {}
    for (const row of summary.byCategory) {
      if (row.categoryId) map[row.categoryId] = row.budgetedCents
    }
    return map
  }, [summary])
  const expenseCategories = React.useMemo(
    () => categories.filter((c) => c.kind === "expense"),
    [categories],
  )

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <BudgetHeader
        month={month}
        today={today}
        description="What the month is measured against: a total, and a limit per category."
      />
      <CategoryBars summary={summary} categories={categories} />
      <BudgetsForm
        month={month}
        categories={expenseCategories}
        budgetedByCategory={budgetedByCategory}
        monthlyBudgetCents={summary.monthlyBudgetCents}
      />
    </div>
  )
}
