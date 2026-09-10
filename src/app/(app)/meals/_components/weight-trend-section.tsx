// The body-weight trend: one point per weigh-in, the smoothed trend through them, and the
// goal weight as a dashed line. A SERVER component so its SVG chart stays server-rendered —
// it's passed into the client MealsView as a prop rather than imported by it, the same
// arrangement budget/page.tsx uses for TrendsSection.
//
// T4 drew one point per WEEK, the latest weigh-in in each, and needed two weeks before it
// drew a line. Three weigh-ins inside a week produced a point and a stub — which is the
// "nothing is done with them" T29 was asked to fix. See `weightTrend`.

import { LineChart } from "@/components/charts/line-chart"
import type { ChartSeries } from "@/components/charts/types"
import {
  formatWeight,
  formatWeightRate,
  toDisplayWeight,
  weightUnitLabel,
} from "@/lib/format"
import {
  weightGoalPhrase,
  type WeightReadout,
  type WeightTrend,
} from "@/modules/meals/service"

/** 'YYYY-MM-DD' → "7/20". Parsed as UTC so the label never shifts by an offset. */
function dayLabel(date: string, locale: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  })
}

/** The chart plots in the DISPLAYED unit, to one decimal, so its axis reads as the card does. */
function plotted(lb: number, unit: "lb" | "kg"): number {
  return Number(toDisplayWeight(lb, unit).toFixed(1))
}

/** At most about eight labels along the axis, however many weigh-ins there are. */
const LABELS_SHOWN = 8

export function WeightTrendSection({
  trend,
  readout,
  locale,
  unit,
}: {
  trend: WeightTrend
  readout: WeightReadout | null
  /** Props, not hooks — this renders on the server. See `TrendsSection`. */
  locale: string
  unit: "lb" | "kg"
}) {
  // Nothing logged: stay quiet. The weigh-in card sits directly above, so there's no
  // discovery problem to solve with an empty box here.
  if (!readout || trend.points.length === 0) return null

  if (trend.points.length === 1) {
    return (
      <section className="mt-4">
        <h2 className="mb-2 text-sm font-semibold">Weight</h2>
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {formatWeight(readout.latestLb, unit)} so far. Log another weigh-in
          and the trend shows up here.
        </p>
      </section>
    )
  }

  const labels = trend.points.map((point) => dayLabel(point.date, locale))
  // The readings in a muted stroke UNDER the trend in the primary one: the trend is the
  // number worth reading, and the readings are there to show what it is smoothing.
  const series: ChartSeries[] = [
    {
      name: "Weigh-in",
      className: "stroke-muted-foreground",
      points: trend.points.map((point) => ({
        value: plotted(point.weightLb, unit),
        display: formatWeight(point.weightLb, unit),
      })),
    },
    {
      name: "Trend",
      className: "stroke-primary",
      points: trend.points.map((point) => ({
        value: plotted(point.trendLb, unit),
        display: formatWeight(point.trendLb, unit),
      })),
    },
  ]
  const goal = readout.goal

  return (
    <section className="mt-4">
      <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
        Weight
        <span className="text-muted-foreground text-xs font-normal tabular-nums">
          trend {formatWeight(readout.trendLb, unit)}
          {readout.ratePerWeekLb !== null &&
            ` · ${formatWeightRate(readout.ratePerWeekLb, unit)}`}
          {goal && ` · ${weightGoalPhrase(goal, unit)}`}
        </span>
      </h2>

      <div className="rounded-xl border p-4">
        <LineChart
          labels={labels}
          series={series}
          formatValue={String}
          // Fitted to the data, not anchored at zero: nobody's weight goes near 0, and
          // a 0-based axis squeezes a real 4 lb swing into a flat line. See niceScale.
          baseline="data"
          labelStep={Math.ceil(trend.points.length / LABELS_SHOWN)}
          reference={
            goal
              ? { value: plotted(goal.goalLb, unit), label: "Goal" }
              : undefined
          }
          ariaLabel={`Body weight over the last ${trend.points.length} weigh-ins, in ${weightUnitLabel(unit)}`}
        />
        <p className="text-muted-foreground mt-2 text-xs">
          One point per weigh-in. The line is the trend, which smooths the
          day-to-day swings; the readouts quote it, not the scale.
        </p>
      </div>
    </section>
  )
}
