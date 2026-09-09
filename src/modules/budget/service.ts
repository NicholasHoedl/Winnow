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
export function monthRange(month: string): {
  start: string
  nextStart: string
} {
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

/** Income per source category. Deliberately a SEPARATE type and list from
 * CategoryRollup: letting income rows into `byCategory` would put them into every
 * spent-vs-budget bar that reads it (the dashboard's category bars included). */
export type IncomeRollup = {
  categoryId: string | null
  earnedCents: number
}

export type MonthSummary = {
  incomeCents: number
  expenseCents: number
  netCents: number
  /**
   * What the month's spend is measured against: the total set for the month when there
   * is one, else the category budgets added up. Every "spent of $X" reads this and none
   * of them needs to know which it got — the dashboard card, the review and the
   * first-run guard were written against the sum and work unchanged against a total.
   */
  totalBudgetedCents: number
  /** The total set for the month; 0 when none is in effect. */
  monthlyBudgetCents: number
  /** Expense spend vs budget. Income never appears here. */
  byCategory: CategoryRollup[]
  incomeByCategory: IncomeRollup[]
}

/** Roll a month's transactions + budgets into income/expense/net totals and
 * per-category spent-vs-budgeted (expense spend only; income isn't budgeted).
 * `monthlyBudgetCents` is the total in effect for the month — see
 * {@link monthlyBudgetInEffect} — and 0 means there isn't one. */
export function summarizeMonth(
  transactions: MoneyTransaction[],
  budgets: MoneyBudget[],
  monthlyBudgetCents = 0,
): MonthSummary {
  let incomeCents = 0
  let expenseCents = 0
  const spentByCategory = new Map<string | null, number>()
  const earnedByCategory = new Map<string | null, number>()

  for (const tx of transactions) {
    if (tx.type === "income") {
      incomeCents += tx.amountCents
      earnedByCategory.set(
        tx.categoryId,
        (earnedByCategory.get(tx.categoryId) ?? 0) + tx.amountCents,
      )
    } else {
      expenseCents += tx.amountCents
      spentByCategory.set(
        tx.categoryId,
        (spentByCategory.get(tx.categoryId) ?? 0) + tx.amountCents,
      )
    }
  }

  const budgetByCategory = new Map<string, number>()
  let categoryBudgetedCents = 0
  for (const budget of budgets) {
    budgetByCategory.set(budget.categoryId, budget.amountCents)
    categoryBudgetedCents += budget.amountCents
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

  const incomeByCategory: IncomeRollup[] = [...earnedByCategory].map(
    ([categoryId, earnedCents]) => ({ categoryId, earnedCents }),
  )

  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    // A total wins over the sum outright rather than combining with it: the categories
    // are limits on parts of the month and the total is a limit on all of it, so adding
    // them would count the budgeted part twice.
    totalBudgetedCents:
      monthlyBudgetCents > 0 ? monthlyBudgetCents : categoryBudgetedCents,
    monthlyBudgetCents,
    byCategory,
    incomeByCategory,
  }
}

/** Share of the period's income that wasn't spent, as a fraction (0.25 = 25%).
 * Null when there was no income — a savings rate on nothing is meaningless, not 0.
 * Goes negative when spending exceeded income.
 *
 * This is a FLOW, not a balance: the app has no accounts table, so "savings" here
 * means "what this period kept", never "what you have". */
export function savingsRate(summary: MonthSummary): number | null {
  if (summary.incomeCents <= 0) return null
  return summary.netCents / summary.incomeCents
}

// --- multi-month rollup (trends) ---

export type DatedTransaction = MoneyTransaction & { date: string }
export type DatedBudget = MoneyBudget & { periodMonth: string }
export type MonthlySummary = { month: string; summary: MonthSummary }

/** A standing total: in force from `effectiveFrom` (a first-of-month) until a later row. */
export type DatedMonthlyBudget = { effectiveFrom: string; amountCents: number }

/**
 * The total in effect for `month` ('YYYY-MM' or any date in it): the latest row starting
 * on or before its first day, 0 when none does. The resolution `targetsForDate` gives
 * macro targets, over rows in any order.
 */
export function monthlyBudgetInEffect(
  rows: DatedMonthlyBudget[],
  month: string,
): number {
  const key = monthKey(month)
  let inEffect: DatedMonthlyBudget | undefined
  for (const row of rows) {
    if (row.effectiveFrom > key) continue
    if (!inEffect || row.effectiveFrom > inEffect.effectiveFrom) inEffect = row
  }
  return inEffect?.amountCents ?? 0
}

/** Bucket transactions + budgets by month and roll each one up. `months` drives the
 * output, so a month with no activity still yields a zero row — a trend chart needs
 * the gap, not a missing point. */
export function summarizeMonths(
  transactions: DatedTransaction[],
  budgets: DatedBudget[],
  months: string[],
  monthlyBudgets: DatedMonthlyBudget[] = [],
): MonthlySummary[] {
  const txByMonth = new Map<string, DatedTransaction[]>()
  for (const tx of transactions) {
    const key = tx.date.slice(0, 7)
    const bucket = txByMonth.get(key)
    if (bucket) bucket.push(tx)
    else txByMonth.set(key, [tx])
  }

  const budgetsByMonth = new Map<string, DatedBudget[]>()
  for (const budget of budgets) {
    const key = budget.periodMonth.slice(0, 7)
    const bucket = budgetsByMonth.get(key)
    if (bucket) bucket.push(budget)
    else budgetsByMonth.set(key, [budget])
  }

  return months.map((month) => ({
    month,
    summary: summarizeMonth(
      txByMonth.get(month) ?? [],
      budgetsByMonth.get(month) ?? [],
      // Resolved per month, not once for the window: a total changed mid-window applies
      // from its own month, and the months before keep the figure they had.
      monthlyBudgetInEffect(monthlyBudgets, month),
    ),
  }))
}

// --- Transaction list filters ---
// Declared here rather than in queries.ts so the client filter bar can import the
// sentinel (queries.ts is `server-only`).

/** Sentinel for "transactions with no category" — a filter value, not an id. */
export const UNCATEGORIZED = "none"

export type TransactionFilters = {
  /** Matched against payee and description. */
  q?: string
  /** A category id, or UNCATEGORIZED. */
  categoryId?: string
  type?: "income" | "expense"
  sort?: "date" | "amount"
  dir?: "asc" | "desc"
}

// --- Natural-language quick-add (transactions) ---
// Pure: turn a typed line into a createTransaction-ready payload (minus the caller-
// supplied date). Amounts are DOLLARS/major units — the action rounds to minor units via
// `amountToMinor`; direction lives in `type`, never a negative amount. Sibling of the date
// parser in `src/lib/nl-date.ts`, whose matcher-ordering + span-removal style this mirrors.

export type CategoryOption = {
  id: string
  name: string
  kind: "income" | "expense"
}

export type ParsedTransaction = {
  amount: number
  type: "income" | "expense"
  categoryId: string
  description: string
}

// Grouped-thousands or plain digits, with an optional decimal.
const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`
// A "marked" amount carries a `$` and/or a leading +/- sign (two alternatives so the sign
// attaches to either form). Tried before a bare number so "buy 2 coffees for $8" → 8.
const AMOUNT_MARKED = new RegExp(
  String.raw`([+-])?\$\s?(${NUM})|([+-])\s?(${NUM})`,
)
const AMOUNT_BARE = new RegExp(String.raw`\b(${NUM})\b`)
const CATEGORY_TAG = /#([\p{L}\p{N}_-]+)/u

// Remove non-overlapping [start, end) ranges from `text`, joining the gaps.
function stripSpans(text: string, spans: Array<[number, number]>): string {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  let out = ""
  let cursor = 0
  for (const [start, end] of sorted) {
    if (start < cursor) continue
    out += text.slice(cursor, start)
    cursor = end
  }
  return out + text.slice(cursor)
}

/**
 * Parse a quick-add line into a transaction payload, or null when there's no amount.
 * `#tag` resolves against `categories` by name (case-insensitive) and by matching `kind`;
 * a tag that only names a category of the other kind resolves to nothing, exactly like a
 * tag that names no category at all. The caller supplies the date.
 */
export function parseTransactionQuickAdd(
  text: string,
  categories: CategoryOption[],
): ParsedTransaction | null {
  if (!text.trim()) return null

  const marked = AMOUNT_MARKED.exec(text)
  const bare = marked ? null : AMOUNT_BARE.exec(text)
  const hit = marked ?? bare
  if (!hit) return null

  const sign = marked ? (marked[1] ?? marked[3]) : undefined
  const magnitude = marked ? (marked[2] ?? marked[4]) : hit[1]
  const type: "income" | "expense" = sign === "+" ? "income" : "expense"
  const amount = parseFloat(magnitude.replace(/,/g, ""))

  const spans: Array<[number, number]> = [
    [hit.index, hit.index + hit[0].length],
  ]

  let categoryId = ""
  const tag = CATEGORY_TAG.exec(text)
  if (tag) {
    spans.push([tag.index, tag.index + tag[0].length])
    const name = tag[1].toLowerCase()
    // No fallback to a same-named category of the other kind: filing an expense
    // against an income category is what the server rejects, and it would put the
    // spend in the wrong rollup. Uncategorized is the honest answer.
    const picked = categories.find(
      (c) => c.name.toLowerCase() === name && c.kind === type,
    )
    if (picked) categoryId = picked.id
  }

  const description = stripSpans(text, spans)
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 300)

  return { amount, type, categoryId, description }
}
