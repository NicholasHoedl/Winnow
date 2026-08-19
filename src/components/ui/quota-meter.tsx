import { formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"

// A quota drawn as the discrete thing it is: one square per log you owe, filled in as you
// make them.
//
// Hand-rolled rather than taken from the shadcn registry, which has `Progress` and nothing
// like this. `Progress` is a continuous bar, and a continuous bar is the wrong shape for
// "three times this week": a smooth 66% fill implies a quantity you are partway through
// accumulating, when what you actually have is two logs and one to go. ADR-0014 already
// says a habit is a quota and a log rather than a done-or-not-done thing — this is that
// idea in the one place a reader looks fastest.
//
// **The squares are a fixed size, and the ROW is what varies.** They were `flex-1` until
// measured habits shipped, which meant the same three-a-week quota drew fat segments in a
// wide card and thin ones in a narrow chip, and a quota of three drew segments four times
// the width of a quota of twelve on the same row. Every one of those is the geometry
// answering a question nobody asked: a segment's width was a fact about its container, not
// about the habit. Fixed squares put the meaning back where it belongs — a longer row IS a
// bigger commitment, at a glance, across every habit on the page.
//
// A continuous bar survives for exactly one case, and it is a different question rather
// than a fallback: see `measured` below.

/**
 * Above this, the row outgrows the narrowest surface that draws one and a bar takes over.
 *
 * **Ten is measured, not chosen.** It was twelve while the segments were `flex-1` and a
 * limit only had to answer "how many slivers can you still count". Fixed squares gave the
 * row a real width, so the binding constraint moved: the 192px habit chip in `/activity`'s
 * strip gives its meter 108px, and at 8px a square plus a 2px gap, twelve squares need 118.
 * They overflowed it by ten pixels — and did so INVISIBLY to the layout sweep, because the
 * chip lives inside a horizontal scroller and a scroller is allowed to have content wider
 * than itself.
 *
 * Ten squares need 98px and fit with room. Eleven need 108 and would sit on the boundary,
 * which is not a place to leave a number that depends on a font metric.
 *
 * If a surface narrower than 192px ever draws a quota, this is the number that has to move
 * — and `e2e/mobile-layout.spec.ts` will not tell you, so measure the bar.
 */
export const MAX_SEGMENTS = 10

export type QuotaSegments = {
  /** How many squares to draw. Grows past `target` when you have gone over. */
  total: number
  /** Of those, how many are filled at all. */
  filled: number
  /** Of the filled ones, how many are beyond the target. */
  surplus: number
  /** False when squares are the wrong shape for this quota — draw a bar instead. */
  segmented: boolean
}

/**
 * How many squares, how many filled, and whether squares make sense at all.
 *
 * Pure and separated from the rendering because the interesting cases are arithmetic, not
 * layout: exceeding the target has to grow the row rather than clamp it, and a target of
 * zero has to draw nothing rather than divide by it.
 *
 * `measured` is not a size threshold like `MAX_SEGMENTS` — it is a statement that this
 * quota has no squares to draw. "5.5 of 10 km" is a quantity you are partway through
 * accumulating, which is precisely the reading a continuous bar gives and precisely the
 * one squares were built to avoid for sessions. Without it, a target of 3 L a day would
 * floor 1.5 into one filled square of three and report a third of a litre as nothing.
 */
export function quotaSegments(
  done: number,
  target: number,
  measured = false,
): QuotaSegments {
  if (measured) {
    const safeDone = Math.max(0, done)
    const safeTarget = Math.max(0, target)
    return {
      total: Math.max(safeTarget, safeDone),
      filled: Math.min(safeDone, Math.max(safeTarget, safeDone)),
      surplus: Math.max(0, safeDone - safeTarget),
      segmented: false,
    }
  }
  const safeDone = Math.max(0, Math.floor(done))
  const safeTarget = Math.max(0, Math.floor(target))
  // The row grows to fit an overshoot rather than clamping, so `3/2` reads as "target met,
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
  unit,
  measured = false,
  className,
  segmentClassName,
}: {
  done: number
  target: number
  /** What this quota is for — becomes the meter's accessible name. */
  name: string
  /** The cadence, e.g. "this week". Drawn after the row and read out with the count. */
  caption?: string
  /**
   * The unit `done` and `target` are in — "words", "km" — or null for a session habit.
   *
   * Comes off the `Adherence` reading rather than off the habit row, so no surface has to
   * carry the rule alongside the numbers it draws.
   */
  unit?: string | null
  /** True when the figures are an amount rather than a count of sessions. */
  measured?: boolean
  className?: string
  /** Size of the squares; callers run at different densities. */
  segmentClassName?: string
}) {
  const { total, filled, surplus, segmented } = quotaSegments(
    done,
    target,
    measured,
  )
  const unitSuffix = unit ? ` ${unit}` : ""
  const suffix = caption ? ` ${caption}` : ""
  // `formatAmount` on both, always: it is a no-op on the whole numbers a session quota
  // deals in, and the alternative is two spellings of one number on one row.
  const figures = `${formatAmount(done)}/${formatAmount(target)}${unitSuffix}`

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
        aria-valuetext={`${formatAmount(done)} of ${formatAmount(target)}${unitSuffix}${suffix}`}
        className={cn(
          "flex items-center gap-0.5",
          // Squares take exactly the room they need and no more, so the caption sits WITH
          // them. Left over from `flex-1`, this stretched to the full row and stranded
          // "this week" against the far edge with 200px of nothing before it — invisible
          // while the segments themselves filled that space, and obvious the moment they
          // stopped. A continuous bar is the opposite case: it is proportional, so it has
          // to take whatever width there is or the fill means nothing.
          segmented ? "shrink-0" : "min-w-0 flex-1",
        )}
      >
        {segmented ? (
          Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                // `size-2` and `shrink-0` — a square that is the same square on every
                // habit and every surface. `shrink-0` rather than a shrinking basis is
                // deliberate: a square that quietly compresses under pressure is the old
                // behaviour wearing a fixed size, and it would come back exactly where it
                // is least wanted, on the narrowest surface. `MAX_SEGMENTS` is what keeps
                // the row inside its container instead.
                "size-2 shrink-0 rounded-[2px] transition-colors",
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
          // Either too many logs to count by eye, or a measured quota, which has nothing
          // discrete to count in the first place. The caller shows the numbers in this
          // case, because with the squares gone there is nothing left saying how far along
          // you are.
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
        {/* The numbers come back only when the squares are gone. Countable squares make
            "2/3" redundant; a continuous bar makes it essential — and a measured habit
            always lands here, because "how far through 10 km" is not a thing you read off
            a bar to one decimal place. */}
        {segmented ? caption : `${figures}${suffix}`}
      </span>
    </div>
  )
}
