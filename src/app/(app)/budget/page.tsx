import { APP_TIME_ZONE } from "@/lib/config"
import {
  getCategories,
  getMonthBudgets,
  getMonthTransactions,
} from "@/modules/budget/queries"
import { summarizeMonth } from "@/modules/budget/service"
import { todayInZone } from "@/modules/todos/service"

import { BudgetView } from "./_components/budget-view"

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const today = todayInZone(new Date(), APP_TIME_ZONE) // YYYY-MM-DD
  const currentMonth = today.slice(0, 7) // YYYY-MM
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentMonth

  const [categories, transactions, budgets] = await Promise.all([
    getCategories(),
    getMonthTransactions(month),
    getMonthBudgets(month),
  ])
  const summary = summarizeMonth(transactions, budgets)

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
