// Weekly body-weight trend. A SERVER component so its SVG chart stays server-rendered —
// it's passed into the client MealsView as a prop rather than imported by it, the same
// arrangement budget/page.tsx uses for TrendsSection.

import { LineChart } from "@/components/charts/line-chart"
import type { ChartSeries } from "@/components/charts/types"
import type { WeeklyWeight } from "@/modules/meals/service"

/** 'YYYY-MM-DD' → "7/20". Parsed as UTC so the label never shifts by an offset. */
function weekLabel(date: string, locale: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  })
}

/** 182 or 182.4, never 182.40. */
function lb(value: number): string {
  return String(Number(value.toFixed(1)))
}

export function WeightTrendSection({
  points,
  locale,
}: {
  points: WeeklyWeight[]
  /** A prop, not a hook — this renders on the server. See `TrendsSection`. */
  locale: string
}) {
  // Nothing logged: stay quiet. The weigh-in card sits directly above, so there's no
  // discovery problem to solve with an empty box here.
  if (points.length === 0) return null

  if (points.length === 1) {
    return (
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Weight</h2>
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {lb(points[0].weightLb)} lb so far. Log another weigh-in and the trend
          shows up here.
        </p>
      </section>
    )
  }

  const labels = points.map((point) => weekLabel(point.weekStart, locale))
  const series: ChartSeries[] = [
    {
      name: "Weight",
      className: "stroke-primary",
      points: points.map((point) => ({
        value: point.weightLb,
        display: `${lb(point.weightLb)} lb`,
      })),
    },
  ]

  const change = points[points.length - 1].weightLb - points[0].weightLb
  const rounded = Number(change.toFixed(1))

  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
        Weight
        <span className="text-muted-foreground text-xs font-normal tabular-nums">
          {rounded === 0
            ? "no change"
            : `${rounded > 0 ? "+" : "−"}${lb(Math.abs(rounded))} lb`}{" "}
          over {points.length} weigh-ins
        </span>
      </h2>

      <div className="rounded-xl border p-4">
        <LineChart
          labels={labels}
          series={series}
          formatValue={lb}
          // Fitted to the data, not anchored at zero: nobody's weight goes near 0, and
          // a 0-based axis squeezes a real 4 lb swing into a flat line. See niceScale.
          baseline="data"
          ariaLabel={`Body weight over the last ${points.length} weeks, in pounds`}
        />
        <p className="text-muted-foreground mt-2 text-xs">
          One point per week — the latest weigh-in in each. Weeks with no
          weigh-in are skipped rather than drawn as zero.
        </p>
      </div>
    </section>
  )
}
