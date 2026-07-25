import {
  getBudgetSummary,
  getCategories,
  getMonthBudgets,
  getMonthTransactions,
} from "@/modules/budget/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { todayInZone } from "@/lib/date"

import { BudgetView } from "./_components/budget-view"

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const { timeZone } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone) // YYYY-MM-DD
  const currentMonth = today.slice(0, 7) // YYYY-MM
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentMonth

  // The summary comes from its own unfiltered read rather than being derived from the
  // rendered `transactions` array — once that list can be filtered (T3-S4), deriving
  // the header stats from it would silently report only the filtered subset.
  const [categories, transactions, budgets, summary] = await Promise.all([
    getCategories(),
    getMonthTransactions(month),
    getMonthBudgets(month),
    getBudgetSummary(month),
  ])

  return (
    <BudgetView
      month={month}
      today={today}
      categories={categories}
      transactions={transactions}
      budgets={budgets}
      summary={summary}
    />
  )
}
