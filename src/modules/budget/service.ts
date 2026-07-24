// Pure budget logic. Money is stored as integer minor units (cents for USD, whole
// yen for JPY, …); the major amount appears only at the input/display boundary via
// these helpers. No DB — unit-testable directly.

// Minor-unit exponent for a currency: 2 for USD/EUR (cents), 0 for JPY/KRW, 3 for
// BHD/KWD. Read from Intl so we don't maintain a table; defaults to 2 if the code
// is somehow unknown (Intl throws on invalid ISO codes).
export function currencyFractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

/** User-entered major amount → integer minor units for storage, rounded at the
 * currency's precision. USD 12.34 → 1234; JPY 1000 → 1000. */
export function amountToMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyFractionDigits(currency))
}

/** Inverse of {@link amountToMinor}: integer minor units → major amount for
 * editing/display. USD 1234 → 12.34; JPY 1000 → 1000. */
export function minorToAmount(minor: number, currency: string): number {
  return minor / 10 ** currencyFractionDigits(currency)
}

/** The currency's symbol (e.g. "$", "¥", "€") for labelling amount inputs, or the
 * ISO code itself as a fallback. */
export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).formatToParts(0)
    return parts.find((part) => part.type === "currency")?.value ?? currency
  } catch {
    return currency
  }
}

/** Format integer minor units as a localized currency string (symbol + the
 * currency's decimal places). The divisor tracks the currency's precision, so
 * JPY renders whole yen and USD renders cents. */
export function formatCents(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    minor / 10 ** currencyFractionDigits(currency),
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
