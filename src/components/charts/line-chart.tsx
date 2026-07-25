// Multi-series line chart, server-rendered like BarChart. Points carry a <title> and
// a generous invisible hit area so hovering anywhere near one shows its value.

import { cn } from "@/lib/utils"

import { linePath, niceScale, scaleY, slotCenter } from "./geometry"
import type { ChartSeries } from "./types"

const VIEW_W = 400
const AXIS_W = 46
const AXIS_H = 16

export function LineChart({
  labels,
  series,
  formatValue,
  ariaLabel,
  height = 130,
  className,
}: {
  labels: string[]
  series: ChartSeries[]
  formatValue: (value: number) => string
  ariaLabel: string
  height?: number
  className?: string
}) {
  const plotW = VIEW_W - AXIS_W
  const plotH = height - AXIS_H

  const values = series.flatMap((s) => s.points.map((p) => p.value))
  const scale = niceScale(
    values.length ? Math.min(...values) : 0,
    values.length ? Math.max(...values) : 0,
  )

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className={cn("w-full", className)}
    >
      {scale.ticks.map((tick) => {
        const y = scaleY(tick, scale, plotH)
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

      {series.map((s) => {
        const points = s.points.map((point, index) => ({
          x: AXIS_W + slotCenter(index, labels.length, plotW),
          y: scaleY(point.value, scale, plotH),
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

      {labels.map((label, index) => (
        <text
          key={label}
          x={AXIS_W + slotCenter(index, labels.length, plotW)}
          y={height - 4}
          textAnchor="middle"
          className="fill-muted-foreground text-[8px]"
        >
          {label}
        </text>
      ))}
    </svg>
  )
}
