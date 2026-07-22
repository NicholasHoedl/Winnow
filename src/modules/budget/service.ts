// Pure budget logic. Money is integer cents everywhere; dollars appear only at
// the input/display boundary via these helpers. No DB — unit-testable directly.

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export function centsToDollars(cents: number): number {
  return cents / 100
}

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  )
}

/** 'YYYY-MM-DD' (or 'YYYY-MM') → first-of-month 'YYYY-MM-01'. */
export function monthKey(date: string): string {
  return `${date.slice(0, 7)}-01`
}

/** Half-open [start, nextStart) bounds for a month, for date filtering. */
export function monthRange(month: string): { start: string; nextStart: string } {
  const start = monthKey(month)
  const [year, monthNum] = start.split("-").map(Number)
  const nextYear = monthNum === 12 ? year + 1 : year
  const nextMonth = monthNum === 12 ? 1 : monthNum + 1
  const nextStart = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
  return { start, nextStart }
}

export type MoneyTransaction = {
  categoryId: string | null
  amountCents: number
  type: "income" | "expense"
}

export type MoneyBudget = {
  categoryId: string
  amountCents: number
}

export type CategoryRollup = {
  categoryId: string | null
  spentCents: number
  budgetedCents: number
  remainingCents: number
}

export type MonthSummary = {
  incomeCents: number
  expenseCents: number
  netCents: number
  totalBudgetedCents: number
  byCategory: CategoryRollup[]
}

/** Roll a month's transactions + budgets into income/expense/net totals and
 * per-category spent-vs-budgeted (expense spend only; income isn't budgeted). */
export function summarizeMonth(
  transactions: MoneyTransaction[],
  budgets: MoneyBudget[],
): MonthSummary {
  let incomeCents = 0
  let expenseCents = 0
  const spentByCategory = new Map<string | null, number>()

  for (const tx of transactions) {
    if (tx.type === "income") {
      incomeCents += tx.amountCents
    } else {
      expenseCents += tx.amountCents
      spentByCategory.set(
        tx.categoryId,
        (spentByCategory.get(tx.categoryId) ?? 0) + tx.amountCents,
      )
    }
  }

  const budgetByCategory = new Map<string, number>()
  let totalBudgetedCents = 0
  for (const budget of budgets) {
    budgetByCategory.set(budget.categoryId, budget.amountCents)
    totalBudgetedCents += budget.amountCents
  }

  // A row for every category that has spend OR a budget this month.
  const categoryIds = new Set<string | null>([
    ...spentByCategory.keys(),
    ...budgetByCategory.keys(),
  ])
  const byCategory: CategoryRollup[] = []
  for (const categoryId of categoryIds) {
    const spentCents = spentByCategory.get(categoryId) ?? 0
    const budgetedCents = categoryId
      ? (budgetByCategory.get(categoryId) ?? 0)
      : 0
    byCategory.push({
      categoryId,
      spentCents,
      budgetedCents,
      remainingCents: budgetedCents - spentCents,
    })
  }

  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    totalBudgetedCents,
    byCategory,
  }
}
