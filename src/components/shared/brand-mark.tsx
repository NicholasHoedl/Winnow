import { BRAND_MARK } from "@/lib/brand-mark"

/**
 * The app's mark as an inline SVG: the grain in a sieve on its rounded tile, the same
 * drawing the favicon and the app icons are generated from (`src/lib/brand-mark.ts`).
 *
 * The two colours are passed as CSS values, not classes, because the same mark sits on
 * two different surfaces: the sidebar's own palette (`--sidebar-primary`, which is the
 * muted teal in both themes) and the page's (`--primary`). A variable reference keeps it
 * theme-aware without a client component.
 *
 * Decorative by default: the wordmark beside it carries the name, and a screen reader
 * announcing "Winnow" twice is worse than once.
 */
export function BrandMark({
  tile,
  ink,
  className,
}: {
  /** CSS colour for the tile, e.g. `var(--primary)`. */
  tile: string
  /** CSS colour for the ring and grain, e.g. `var(--primary-foreground)`. */
  ink: string
  className?: string
}) {
  const { viewBox, tileRadius, ring, grain } = BRAND_MARK
  return (
    <svg viewBox={viewBox} className={className} aria-hidden>
      <rect width="512" height="512" rx={tileRadius} fill={tile} />
      <circle
        cx={ring.cx}
        cy={ring.cy}
        r={ring.r}
        fill="none"
        stroke={ink}
        strokeWidth={ring.strokeWidth}
      />
      <path
        d={grain.d}
        fill={ink}
        fillRule="evenodd"
        transform={grain.transform}
      />
    </svg>
  )
}
