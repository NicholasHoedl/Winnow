import {
  getBudgetSummary,
  getCategories,
  getMonthTransactions,
} from "@/modules/budget/queries"
import {
  UNCATEGORIZED,
  type TransactionFilters,
} from "@/modules/budget/service"
import { aiReady } from "@/modules/companion/ai-settings"
import { getPendingProposals } from "@/modules/companion/queries"
import {
  getAiSettings,
  getUserPreferences,
} from "@/modules/preferences/queries"
import { todayInZone } from "@/lib/date"

import { BudgetView } from "./_components/budget-view"
import { BudgetAiTools } from "./_components/budget-ai-tools"
import { monthParam } from "./_lib/month"

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

/**
 * The ledger — the Budget section's hub. Since T30 it holds the month's stats, quick add,
 * the transaction list and the AI import; the by-category bars are on /budget/budgets,
 * the charts on /budget/trends, and the category and budget editors are pages of their
 * own (ADR-0024). The stats stay here because the month's totals are what the ledger is
 * read against, and the import stays because ADR-0015 puts a tool on the page of the
 * rows it makes.
 */
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
  const { timeZone, currency } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone) // YYYY-MM-DD
  const month = monthParam(params.month, today)

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
  const [categories, transactions, summary, aiSettings, pending] =
    await Promise.all([
      getCategories(),
      getMonthTransactions(month, filters),
      getBudgetSummary(month),
      getAiSettings(),
      // `import` only. Without the filter this page would auto-open whatever proposal was
      // newest — a plan, a narrated week — because the view opens `pending[0]`.
      getPendingProposals("import"),
    ])

  return (
    <BudgetView
      month={month}
      today={today}
      categories={categories}
      transactions={transactions}
      summary={summary}
      filters={filters}
      // Passed as an element: the page composes, the view places. Null when the
      // companion is off, so `BudgetView` renders nothing rather than reasoning about
      // it — a budget is not an AI feature.
      aiTools={
        aiReady(aiSettings) ? (
          <BudgetAiTools
            pending={pending}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            currency={currency}
          />
        ) : null
      }
    />
  )
}
