import { getBudgetSummary, getCategories } from "@/modules/budget/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { todayInZone } from "@/lib/date"

import { monthParam } from "../_lib/month"
import { BudgetsView } from "./_components/budgets-view"

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const { timeZone } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const month = monthParam(params.month, today)

  const [categories, summary] = await Promise.all([
    getCategories(),
    getBudgetSummary(month),
  ])

  return (
    <BudgetsView
      month={month}
      today={today}
      categories={categories}
      summary={summary}
    />
  )
}
