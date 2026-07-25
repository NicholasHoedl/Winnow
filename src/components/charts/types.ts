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
