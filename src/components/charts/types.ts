export type ChartPoint = {
  /** In the chart's own units — for money, minor units (cents). */
  value: number
  /** Pre-formatted for the hover tooltip, e.g. "$1,204.00". */
  display: string
}

export type ChartSeries = {
  name: string
  /** A literal Tailwind class from lib/colors (`fill-cat-3` / `stroke-cat-3`), so
   * the chart re-themes in dark mode with no JS and no computed colour values. */
  className: string
  points: ChartPoint[]
}

/**
 * A line drawn over a bar chart, one point per slot. A `null` point is a GAP — no value
 * for that slot — which a bar series cannot express, because a bar of 0 is a value.
 */
export type OverlaySeries = {
  name: string
  /** A `stroke-*` class, as for a line series. */
  className: string
  points: (ChartPoint | null)[]
}
