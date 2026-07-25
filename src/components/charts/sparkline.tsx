// A single-series line with no axes or labels — the shape only, for sitting beside a
// number. Server-rendered; the whole svg carries one aria-label describing the trend.

import { cn } from "@/lib/utils"

import { areaPath, linePath, niceScale, scaleY, slotCenter } from "./geometry"
import type { ChartPoint } from "./types"

const VIEW_W = 100
const VIEW_H = 24

export function Sparkline({
  points,
  ariaLabel,
  className = "stroke-primary",
  fillClassName,
}: {
  points: ChartPoint[]
  ariaLabel: string
  /** Stroke class, e.g. "stroke-cat-2". */
  className?: string
  /** Optional area fill under the line, e.g. "fill-cat-2/15". */
  fillClassName?: string
}) {
  if (points.length === 0) return null

  const values = points.map((p) => p.value)
  const scale = niceScale(Math.min(...values), Math.max(...values))
  // Inset by the stroke radius so the line never clips at the top or bottom.
  const inset = 1.5
  const coords = points.map((point, index) => ({
    x: slotCenter(index, points.length, VIEW_W),
    y: inset + scaleY(point.value, scale, VIEW_H - inset * 2),
  }))

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
      className={cn("h-6 w-full", className)}
    >
      {fillClassName && (
        <path
          d={areaPath(coords, VIEW_H)}
          className={cn(fillClassName, "stroke-none")}
        />
      )}
      <path
        d={linePath(coords)}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
