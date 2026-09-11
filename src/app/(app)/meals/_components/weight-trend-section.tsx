// The body-weight trend: one point per weigh-in, the smoothed trend through them, and the
// goal weight as a dashed line. A SERVER component so its SVG chart stays server-rendered —
// it's passed into the client MealsView as a prop rather than imported by it, the same
// arrangement budget/page.tsx uses for TrendsSection.
//
// T4 drew one point per WEEK, the latest weigh-in in each, and needed two weeks before it
// drew a line. Three weigh-ins inside a week produced a point and a stub — which is the
// "nothing is done with them" T29 was asked to fix. See `weightTrend`.
//
// T32 put it in the dashboard's fold shell: the chart is the tallest thing on the page and
// the readout above it already says what it shows, so it folds to its heading and stays
// folded — through the same preference and the same chevron as a dashboard card
// (ADR-0027). The shell is a client component holding this server-rendered chart, which
// is exactly the arrangement ADR-0016 chose for the dashboard.

import { DashboardCard } from "../../_components/dashboard-card"
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
  collapsed,
}: {
  trend: WeightTrend
  readout: WeightReadout | null
  /** Props, not hooks — this renders on the server. See `TrendsSection`. */
  locale: string
  unit: "lb" | "kg"
  /** Read from the folded-cards preference by the page, like a dashboard card's. */
  collapsed: boolean
}) {
  // Nothing logged: stay quiet. The weigh-in card sits directly above, so there's no
  // discovery problem to solve with an empty box here.
  if (!readout || trend.points.length === 0) return null

  if (trend.points.length === 1) {
    return (
      <DashboardCard
        card="weight"
        title="Weight trend"
        collapsed={collapsed}
        className="mt-4"
      >
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {formatWeight(readout.latestLb, unit)} so far. Log another weigh-in
          and the trend shows up here.
        </p>
      </DashboardCard>
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
    <DashboardCard
      card="weight"
      title="Weight trend"
      collapsed={collapsed}
      className="mt-4"
    >
      {/* The readout, as a caption to the chart. It was in the heading until T32, and a
          heading that folds away with its body is no heading; the weigh-in card above
          quotes the same figures, so a folded card loses nothing from the page. */}
      <p className="text-muted-foreground mb-3 text-xs tabular-nums">
        trend {formatWeight(readout.trendLb, unit)}
        {readout.ratePerWeekLb !== null &&
          ` · ${formatWeightRate(readout.ratePerWeekLb, unit)}`}
        {goal && ` · ${weightGoalPhrase(goal, unit)}`}
      </p>
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
    </DashboardCard>
  )
}
