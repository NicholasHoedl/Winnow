// A progress ring with its number in the middle. Server-rendered; the whole svg carries
// one aria-label, since the ring itself says nothing a screen reader can use.

import { cn } from "@/lib/utils"

import { ringArc } from "./geometry"

const STROKE = 6

export function Ring({
  percent,
  label,
  ariaLabel,
  className = "stroke-primary",
}: {
  percent: number
  /** Text in the middle — usually the percentage. */
  label: string
  ariaLabel: string
  /** Stroke class for the filled arc, e.g. "stroke-cat-3". */
  className?: string
}) {
  const ring = ringArc(percent, 28, STROKE)

  return (
    <svg
      viewBox={`0 0 ${ring.size} ${ring.size}`}
      role="img"
      aria-label={ariaLabel}
      className="size-16 shrink-0"
    >
      {/* The unfilled track. Drawn first so the arc sits on top of it. */}
      <circle
        cx={ring.center}
        cy={ring.center}
        r={ring.radius}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-muted"
      />
      <circle
        cx={ring.center}
        cy={ring.center}
        r={ring.radius}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={ring.circumference}
        strokeDashoffset={ring.dashOffset}
        // Rotated so the fill starts at twelve o'clock; SVG angles begin at three.
        transform={`rotate(-90 ${ring.center} ${ring.center})`}
        className={cn(className)}
      />
      <text
        x={ring.center}
        y={ring.center}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-[15px] font-medium tabular-nums"
      >
        {label}
      </text>
    </svg>
  )
}
