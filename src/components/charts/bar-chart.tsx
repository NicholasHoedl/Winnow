// A grouped bar chart as a SERVER component: no client JS, no measurement, no
// resize observer. It scales through the SVG viewBox, themes through Tailwind
// `fill-*` classes, and gets native tooltips from a <title> inside each bar.
//
// `formatValue` is a function prop, which is fine because every caller is itself a
// server component — do not render this from a client component.

import { cn } from "@/lib/utils"

import { barLayout, linePath, niceScale, scaleY, slotCenter } from "./geometry"
import type { ChartSeries, OverlaySeries } from "./types"

const VIEW_W = 400
const AXIS_W = 46 // room for a money tick label
const AXIS_H = 18 // room for the x labels
// The top tick's label is centred on the plot's top edge, so without this its
// ascender would be clipped by the viewBox.
const PAD_T = 6

export function BarChart({
  labels,
  series,
  overlay,
  formatValue,
  ariaLabel,
  height = 130,
  className,
}: {
  /** One x-axis label per slot; every series is indexed against these. */
  labels: string[]
  series: ChartSeries[]
  /**
   * A dashed line over the bars — a limit the bars are read against, such as a monthly
   * budget over monthly spend. It shares the y-axis, so it is drawn to the same scale.
   */
  overlay?: OverlaySeries
  formatValue: (value: number) => string
  ariaLabel: string
  height?: number
  className?: string
}) {
  const plotW = VIEW_W - AXIS_W
  const plotH = height - AXIS_H - PAD_T

  const values = [
    ...series.flatMap((s) => s.points.map((p) => p.value)),
    ...(overlay?.points ?? []).flatMap((p) => (p ? [p.value] : [])),
  ]
  const scale = niceScale(
    values.length ? Math.min(...values) : 0,
    values.length ? Math.max(...values) : 0,
  )
  const yOf = (value: number) => PAD_T + scaleY(value, scale, plotH)
  const zeroY = yOf(0)
  const slots = barLayout(labels.length, plotW)

  // The overlay's runs of consecutive points, each drawn as its own open path so a gap
  // stays a gap rather than being bridged by a line drawn straight across it.
  const overlayRuns: { x: number; y: number }[][] = []
  if (overlay) {
    let run: { x: number; y: number }[] = []
    overlay.points.forEach((point, index) => {
      if (!point) {
        if (run.length) overlayRuns.push(run)
        run = []
        return
      }
      run.push({
        x: AXIS_W + slotCenter(index, labels.length, plotW),
        y: yOf(point.value),
      })
    })
    if (run.length) overlayRuns.push(run)
  }

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

      {overlay && (
        <g>
          {overlayRuns.map((run) => (
            <path
              key={run[0].x}
              d={linePath(run)}
              fill="none"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeLinejoin="round"
              strokeLinecap="round"
              className={overlay.className}
            />
          ))}
          {/* A point per value, as LineChart draws them: the hit area for the tooltip,
              and the only mark a run of one month leaves. */}
          {overlay.points.map((point, index) =>
            point ? (
              <circle
                key={labels[index]}
                cx={AXIS_W + slotCenter(index, labels.length, plotW)}
                cy={yOf(point.value)}
                r={4}
                className={cn(overlay.className, "fill-transparent")}
              >
                <title>{`${labels[index]} · ${overlay.name}: ${point.display}`}</title>
              </circle>
            ) : null,
          )}
        </g>
      )}
    </svg>
  )
}
