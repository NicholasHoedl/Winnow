import {
  getBudgetSummary,
  getBudgetTrends,
  getCategories,
} from "@/modules/budget/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { dateLocale } from "@/lib/preferences"
import { todayInZone } from "@/lib/date"

import { BudgetHeader } from "../_components/budget-header"
import { IncomeSavingsSection } from "../_components/income-savings-section"
import { TrendsSection } from "../_components/trends-section"
import { monthParam } from "../_lib/month"

const TREND_MONTHS = 6

/**
 * The Trends page: where this month's money went, and how the months compare. Both
 * sections are server components with SVG charts, so this page composes them directly —
 * no client view in between, unlike the ledger and the Budgets page, which hold state.
 */
export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const { timeZone, currency, dateFormat } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const month = monthParam(params.month, today)

  const [categories, summary, trends] = await Promise.all([
    getCategories(),
    getBudgetSummary(month),
    getBudgetTrends(month, TREND_MONTHS),
  ])

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <BudgetHeader
        month={month}
        today={today}
        description="Where the money went this month, and how the last six months compare."
      />
      <IncomeSavingsSection
        summary={summary}
        categories={categories}
        currency={currency}
      />
      <TrendsSection
        trends={trends}
        categories={categories}
        currency={currency}
        locale={dateLocale(dateFormat)}
      />
    </div>
  )
}
