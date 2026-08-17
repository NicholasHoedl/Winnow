import { cn } from "@/lib/utils"

// A quota drawn as the discrete thing it is: one segment per log you owe, filled in as you
// make them.
//
// Hand-rolled rather than taken from the shadcn registry, which has `Progress` and nothing
// like this. `Progress` is a continuous bar, and a continuous bar is the wrong shape for
// "three times this week": a smooth 66% fill implies a quantity you are partway through
// accumulating, when what you actually have is two logs and one to go. ADR-0014 already
// says a habit is a quota and a log rather than a done-or-not-done thing — this is that
// idea in the one place a reader looks fastest.

/** Above this, segments become slivers and stop being countable at a glance. */
export const MAX_SEGMENTS = 12

export type QuotaSegments = {
  /** How many boxes to draw. Grows past `target` when you have gone over. */
  total: number
  /** Of those, how many are filled at all. */
  filled: number
  /** Of the filled ones, how many are beyond the target. */
  surplus: number
  /** False when the count is too large to be read as boxes — draw a bar instead. */
  segmented: boolean
}

/**
 * How many boxes, how many filled, and whether boxes make sense at all.
 *
 * Pure and separated from the rendering because the interesting cases are arithmetic, not
 * layout: exceeding the target has to grow the bar rather than clamp it, and a target of
 * zero has to draw nothing rather than divide by it.
 */
export function quotaSegments(done: number, target: number): QuotaSegments {
  const safeDone = Math.max(0, Math.floor(done))
  const safeTarget = Math.max(0, Math.floor(target))
  // The bar grows to fit an overshoot rather than clamping, so `3/2` reads as "target met,
  // and one past it" instead of looking identical to `2/2`.
  const total = Math.max(safeTarget, safeDone)
  return {
    total,
    filled: Math.min(safeDone, total),
    surplus: Math.max(0, safeDone - safeTarget),
    segmented: total > 0 && total <= MAX_SEGMENTS,
  }
}

export function QuotaMeter({
  done,
  target,
  name,
  caption,
  className,
  segmentClassName,
}: {
  done: number
  target: number
  /** What this quota is for — becomes the meter's accessible name. */
  name: string
  /** The cadence, e.g. "this week". Drawn after the bar and read out with the count. */
  caption?: string
  className?: string
  /** Height of the segments; callers run at different densities. */
  segmentClassName?: string
}) {
  const { total, filled, surplus, segmented } = quotaSegments(done, target)
  const suffix = caption ? ` ${caption}` : ""

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        // The meter IS the count now — the visible "2/3" it replaced is gone, so without
        // this a screen reader would get a row of decorative divs and no number at all.
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={target}
        // Clamped, because `aria-valuenow` above `aria-valuemax` is invalid. The true
        // figure, overshoot included, lives in `aria-valuetext` — which is exactly what
        // that attribute is for, and what the e2e asserts on.
        aria-valuenow={Math.min(done, target)}
        aria-valuetext={`${done} of ${target}${suffix}`}
        className="flex min-w-0 flex-1 items-center gap-0.5"
      >
        {segmented ? (
          Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 min-w-0 flex-1 rounded-[2px] transition-colors",
                i >= filled
                  ? "bg-muted"
                  : // Surplus in the accent, not a brighter primary: the accent is the
                    // app's "look here" colour and going over is the one thing on this row
                    // worth a second glance. The category accents are taken elsewhere, but
                    // nothing on a habit row uses them.
                    i >= total - surplus
                    ? "bg-brand-accent"
                    : "bg-primary",
                segmentClassName,
              )}
            />
          ))
        ) : (
          // Too many to count by eye. Falls back to the continuous bar these surfaces had
          // before — and the caller shows the numbers again in this case, because with the
          // segments gone there is nothing left saying how far along you are.
          <span
            className={cn(
              "bg-muted h-1.5 w-full overflow-hidden rounded-full",
              segmentClassName,
            )}
          >
            <span
              className={cn(
                "block h-full rounded-full",
                surplus > 0 ? "bg-brand-accent" : "bg-primary",
              )}
              style={{
                width: `${target > 0 ? Math.min(100, (done / target) * 100) : 0}%`,
              }}
            />
          </span>
        )}
      </div>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {/* The numbers come back only when the boxes are gone. Countable segments make
            "2/3" redundant; an uncountable bar makes it essential. */}
        {segmented ? caption : `${done}/${target}${suffix}`}
      </span>
    </div>
  )
}
