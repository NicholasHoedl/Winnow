import {
  getBudgetSummary,
  getCategories,
  getMonthTransactions,
} from "@/modules/budget/queries"
import {
  UNCATEGORIZED,
  type TransactionFilters,
} from "@/modules/budget/service"
import { getUserPreferences } from "@/modules/preferences/queries"
import { todayInZone } from "@/lib/date"

import { BudgetView } from "./_components/budget-view"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string
    q?: string
    cat?: string
    type?: string
    sort?: string
    dir?: string
  }>
}) {
  const params = await searchParams
  const { timeZone } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone) // YYYY-MM-DD
  const currentMonth = today.slice(0, 7) // YYYY-MM
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentMonth

  // Every filter is validated here, the same way `month` is — the query builds SQL
  // from these, so an unrecognised value is dropped rather than passed through.
  const filters: TransactionFilters = {
    q: params.q?.slice(0, 100),
    categoryId:
      params.cat === UNCATEGORIZED || (params.cat && UUID_RE.test(params.cat))
        ? params.cat
        : undefined,
    type: oneOf(params.type, ["income", "expense"] as const),
    sort: oneOf(params.sort, ["date", "amount"] as const),
    dir: oneOf(params.dir, ["asc", "desc"] as const),
  }

  // The summary comes from its own unfiltered read rather than being derived from the
  // rendered `transactions` array — otherwise filtering the list would silently
  // report the header stats for only the filtered subset.
  const [categories, transactions, summary] = await Promise.all([
    getCategories(),
    getMonthTransactions(month, filters),
    getBudgetSummary(month),
  ])

  return (
    <BudgetView
      month={month}
      today={today}
      categories={categories}
      transactions={transactions}
      summary={summary}
      filters={filters}
    />
  )
}
