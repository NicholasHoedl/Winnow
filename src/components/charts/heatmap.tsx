// A contribution-style grid — one column per week, one row per weekday. Server-rendered,
// with a native <title> per cell for hover.
//
// This component positions squares and nothing else. What a square MEANS, and therefore
// what colour it is, is decided by the caller and arrives as a class — the same division
// bar-chart and line-chart use, and the reason nothing under charts/ knows about tasks or
// dates. The (col, row) maths lives with the dates, in `todos/habits.ts`.

import { cn } from "@/lib/utils"

const CELL = 10
const GAP = 3

export type HeatmapCell = {
  /** React key, unique within the grid — the date works. */
  key: string
  col: number
  row: number
  /** Tailwind fill class, e.g. "fill-cat-3" or "fill-muted". */
  className: string
  /** Hover text, e.g. "Mon, Jul 20 — done". */
  title: string
}

export function Heatmap({
  cells,
  cols,
  rows = 7,
  ariaLabel,
  className,
}: {
  cells: HeatmapCell[]
  cols: number
  rows?: number
  ariaLabel: string
  className?: string
}) {
  if (cols === 0 || cells.length === 0) return null

  const width = cols * (CELL + GAP) - GAP
  const height = rows * (CELL + GAP) - GAP

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      // meet, not none: squares have to stay square, so the grid is left-aligned in
      // whatever width it gets rather than stretched to fill it.
      preserveAspectRatio="xMinYMid meet"
      className={cn("h-22 w-full", className)}
    >
      {cells.map((cell) => (
        <rect
          key={cell.key}
          x={cell.col * (CELL + GAP)}
          y={cell.row * (CELL + GAP)}
          width={CELL}
          height={CELL}
          rx={2}
          className={cell.className}
        >
          <title>{cell.title}</title>
        </rect>
      ))}
    </svg>
  )
}
