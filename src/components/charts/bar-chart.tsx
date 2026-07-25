// A grouped bar chart as a SERVER component: no client JS, no measurement, no
// resize observer. It scales through the SVG viewBox, themes through Tailwind
// `fill-*` classes, and gets native tooltips from a <title> inside each bar.
//
// `formatValue` is a function prop, which is fine because every caller is itself a
// server component — do not render this from a client component.

import { cn } from "@/lib/utils"

import { barLayout, niceScale, scaleY } from "./geometry"
import type { ChartSeries } from "./types"

const VIEW_W = 400
const AXIS_W = 46 // room for a money tick label
const AXIS_H = 18 // room for the x labels
// The top tick's label is centred on the plot's top edge, so without this its
// ascender would be clipped by the viewBox.
const PAD_T = 6

export function BarChart({
  labels,
  series,
  formatValue,
  ariaLabel,
  height = 130,
  className,
}: {
  /** One x-axis label per slot; every series is indexed against these. */
  labels: string[]
  series: ChartSeries[]
  formatValue: (value: number) => string
  ariaLabel: string
  height?: number
  className?: string
}) {
  const plotW = VIEW_W - AXIS_W
  const plotH = height - AXIS_H - PAD_T

  const values = series.flatMap((s) => s.points.map((p) => p.value))
  const scale = niceScale(
    values.length ? Math.min(...values) : 0,
    values.length ? Math.max(...values) : 0,
  )
  const yOf = (value: number) => PAD_T + scaleY(value, scale, plotH)
  const zeroY = yOf(0)
  const slots = barLayout(labels.length, plotW)

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className={cn("w-full", className)}
    >
      {/* gridlines + y labels */}
      {scale.ticks.map((tick) => {
        const y = yOf(tick)
        return (
          <g key={tick}>
            <line
              x1={AXIS_W}
              x2={VIEW_W}
              y1={y}
              y2={y}
              className="stroke-border"
              strokeWidth={tick === 0 ? 1 : 0.5}
            />
            <text
              x={AXIS_W - 5}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[8px] tabular-nums"
            >
              {formatValue(tick)}
            </text>
          </g>
        )
      })}

      {slots.map((slot, index) => {
        const groupWidth = slot.width / Math.max(1, series.length)
        return (
          <g key={labels[index]}>
            {series.map((s, seriesIndex) => {
              const point = s.points[index]
              if (!point) return null
              const y = yOf(point.value)
              const top = Math.min(y, zeroY)
              // Keep a sliver visible for small non-zero values.
              const barHeight =
                point.value === 0 ? 0 : Math.max(1, Math.abs(y - zeroY))
              return (
                <rect
                  key={s.name}
                  x={AXIS_W + slot.x + seriesIndex * groupWidth}
                  y={top}
                  width={groupWidth}
                  height={barHeight}
                  rx={1}
                  className={s.className}
                >
                  <title>{`${labels[index]} · ${s.name}: ${point.display}`}</title>
                </rect>
              )
            })}
            <text
              x={AXIS_W + slot.x + slot.width / 2}
              y={height - 4}
              textAnchor="middle"
              className="fill-muted-foreground text-[8px]"
            >
              {labels[index]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
