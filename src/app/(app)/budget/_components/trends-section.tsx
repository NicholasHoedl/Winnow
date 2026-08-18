// Multi-month trends. A SERVER component so the charts stay server-rendered — it's
// passed into the client BudgetView as a prop rather than imported by it.

import { accentForKey } from "@/lib/colors"
import { BarChart } from "@/components/charts/bar-chart"
import { LineChart } from "@/components/charts/line-chart"
import type { ChartSeries } from "@/components/charts/types"
import type { Category } from "@/modules/budget/queries"
import {
  currencySymbol,
  formatCents,
  minorToAmount,
  type MonthlySummary,
} from "@/modules/budget/service"

const TOP_CATEGORIES = 4

/** 'YYYY-MM' → "Jul". Parsed as UTC so the label never shifts by an offset. */
function monthLabel(month: string, locale: string): string {
  const [year, m] = month.split("-").map(Number)
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(locale, {
    month: "short",
    timeZone: "UTC",
  })
}

/** Axis ticks need to be narrow: $1,250.00 becomes $1.3k. */
function compactMoney(cents: number, currency: string): string {
  const amount = minorToAmount(cents, currency)
  const magnitude = Math.abs(amount)
  const symbol = currencySymbol(currency)
  const sign = amount < 0 ? "-" : ""
  if (magnitude >= 1000) {
    const thousands = magnitude / 1000
    return `${sign}${symbol}${thousands.toFixed(thousands >= 10 ? 0 : 1)}k`
  }
  return `${sign}${symbol}${Math.round(magnitude)}`
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function TrendsSection({
  trends,
  categories,
  currency,
  locale,
}: {
  trends: MonthlySummary[]
  categories: Category[]
  currency: string
  /**
   * A PROP, not `useDateLocale()`. This renders on the server — the whole point of it, so
   * its SVG chart stays a server component — and a hook cannot be called there. The page
   * reads the preference and passes it, exactly as it already does for `currency`.
   */
  locale: string
}) {
  if (trends.length === 0) return null

  const labels = trends.map((t) => monthLabel(t.month, locale))
  const money = (cents: number) => formatCents(cents, currency)
  const tick = (cents: number) => compactMoney(cents, currency)

  const hasActivity = trends.some(
    (t) => t.summary.incomeCents > 0 || t.summary.expenseCents > 0,
  )
  if (!hasActivity) {
    return (
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Trends</h2>
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          Once there are a few months of activity, trends show up here.
        </p>
      </section>
    )
  }

  const inOut: ChartSeries[] = [
    {
      name: "Income",
      className: "fill-cat-5",
      points: trends.map((t) => ({
        value: t.summary.incomeCents,
        display: money(t.summary.incomeCents),
      })),
    },
    {
      name: "Expenses",
      className: "fill-cat-4",
      points: trends.map((t) => ({
        value: t.summary.expenseCents,
        display: money(t.summary.expenseCents),
      })),
    },
  ]

  const net: ChartSeries[] = [
    {
      name: "Net",
      className: "stroke-primary",
      points: trends.map((t) => ({
        value: t.summary.netCents,
        display: money(t.summary.netCents),
      })),
    },
  ]

  // The categories that actually moved money over the window, biggest first.
  const spendByCategory = new Map<string, number>()
  for (const month of trends) {
    for (const row of month.summary.byCategory) {
      if (!row.categoryId) continue
      spendByCategory.set(
        row.categoryId,
        (spendByCategory.get(row.categoryId) ?? 0) + row.spentCents,
      )
    }
  }
  const topCategories = [...spendByCategory.entries()]
    .filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CATEGORIES)

  const categorySeries: ChartSeries[] = topCategories.map(([categoryId]) => ({
    name: categories.find((c) => c.id === categoryId)?.name ?? "Uncategorized",
    className: accentForKey(categoryId).stroke,
    points: trends.map((month) => {
      const spent =
        month.summary.byCategory.find((r) => r.categoryId === categoryId)
          ?.spentCents ?? 0
      return { value: spent, display: money(spent) }
    }),
  }))

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold">
        Trends
        <span className="text-muted-foreground ml-2 text-xs font-normal">
          last {trends.length} months
        </span>
      </h2>

      <div className="flex flex-col gap-4">
        <ChartCard title="Income vs expenses">
          <BarChart
            labels={labels}
            series={inOut}
            formatValue={tick}
            ariaLabel={`Income and expenses for the last ${trends.length} months`}
          />
          <div className="text-muted-foreground mt-2 flex gap-4 text-xs">
            {inOut.map((series) => (
              <span key={series.name} className="flex items-center gap-1.5">
                <span
                  className={
                    series.name === "Income"
                      ? "bg-cat-5 size-2 rounded-full"
                      : "bg-cat-4 size-2 rounded-full"
                  }
                />
                {series.name}
              </span>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Net" hint="income minus expenses">
          <LineChart
            labels={labels}
            series={net}
            formatValue={tick}
            ariaLabel={`Net income for the last ${trends.length} months`}
          />
        </ChartCard>

        {categorySeries.length > 0 && (
          <ChartCard
            title="Spending by category"
            hint={
              categorySeries.length === 1
                ? "top category"
                : `top ${categorySeries.length}`
            }
          >
            <LineChart
              labels={labels}
              series={categorySeries}
              formatValue={tick}
              ariaLabel={
                categorySeries.length === 1
                  ? "Monthly spend for the top category"
                  : `Monthly spend for the top ${categorySeries.length} categories`
              }
            />
            <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {topCategories.map(([categoryId]) => (
                <span key={categoryId} className="flex items-center gap-1.5">
                  <span
                    className={`${accentForKey(categoryId).bar} size-2 rounded-full`}
                  />
                  {categories.find((c) => c.id === categoryId)?.name ??
                    "Uncategorized"}
                </span>
              ))}
            </div>
          </ChartCard>
        )}
      </div>
    </section>
  )
}
