// Multi-series line chart, server-rendered like BarChart. Points carry a <title> and
// a generous invisible hit area so hovering anywhere near one shows its value.

import { cn } from "@/lib/utils"

import { linePath, niceScale, scaleY, slotCenter } from "./geometry"
import type { Baseline } from "./geometry"
import type { ChartSeries } from "./types"

const VIEW_W = 400
const AXIS_W = 46
const AXIS_H = 18
// Keeps the top tick's label inside the viewBox instead of clipping its ascender.
const PAD_T = 6

export function LineChart({
  labels,
  series,
  formatValue,
  ariaLabel,
  height = 130,
  className,
  baseline = "zero",
  labelStep = 1,
  reference,
}: {
  labels: string[]
  series: ChartSeries[]
  formatValue: (value: number) => string
  ariaLabel: string
  height?: number
  className?: string
  /**
   * `"data"` fits the y-axis to the values instead of anchoring it at zero — for
   * quantities read as changes rather than amounts. See {@link niceScale}.
   */
  baseline?: Baseline
  /**
   * Draw every Nth x-axis label, and always the last. For a dense axis — the weight
   * chart has a slot per weigh-in — where every label would overprint its neighbour.
   * Every point keeps its own label for its tooltip and its key; this thins the text only.
   */
  labelStep?: number
  /**
   * A dashed horizontal line at a value, named at its right end: a goal, a target. It
   * widens the y-scale to include itself, so a goal below every reading is still on the
   * chart rather than off the bottom of it.
   */
  reference?: { value: number; label: string }
}) {
  const plotW = VIEW_W - AXIS_W
  const plotH = height - AXIS_H - PAD_T

  const values = [
    ...series.flatMap((s) => s.points.map((p) => p.value)),
    ...(reference ? [reference.value] : []),
  ]
  const scale = niceScale(
    values.length ? Math.min(...values) : 0,
    values.length ? Math.max(...values) : 0,
    4,
    baseline,
  )
  const yOf = (value: number) => PAD_T + scaleY(value, scale, plotH)

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className={cn("w-full", className)}
    >
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

      {reference && (
        <g>
          <line
            x1={AXIS_W}
            x2={VIEW_W}
            y1={yOf(reference.value)}
            y2={yOf(reference.value)}
            strokeWidth={1}
            strokeDasharray="4 3"
            className="stroke-brand-accent"
          />
          <text
            x={VIEW_W - 2}
            y={yOf(reference.value) - 3}
            textAnchor="end"
            className="fill-brand-accent text-[8px]"
          >
            {reference.label}
          </text>
        </g>
      )}

      {series.map((s) => {
        const points = s.points.map((point, index) => ({
          x: AXIS_W + slotCenter(index, labels.length, plotW),
          y: yOf(point.value),
        }))
        return (
          <g key={s.name}>
            <path
              d={linePath(points)}
              fill="none"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              className={s.className}
            />
            {points.map((p, index) => (
              <circle
                key={labels[index]}
                cx={p.x}
                cy={p.y}
                r={4}
                className={cn(s.className, "fill-transparent")}
              >
                <title>{`${labels[index]} · ${s.name}: ${s.points[index].display}`}</title>
              </circle>
            ))}
          </g>
        )
      })}

      {labels.map((label, index) => {
        const last = labels.length - 1
        const step = Math.max(1, Math.floor(labelStep))
        // Every Nth, and the last — unless a stepped label sits close enough to the last
        // one to collide with it, in which case the last wins.
        const shown =
          index === last || (index % step === 0 && last - index >= step / 2)
        if (!shown) return null
        return (
          <text
            key={label}
            x={AXIS_W + slotCenter(index, labels.length, plotW)}
            y={height - 4}
            textAnchor="middle"
            className="fill-muted-foreground text-[8px]"
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}
