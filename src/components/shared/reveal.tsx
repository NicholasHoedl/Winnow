import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * One orchestrated page-load entrance: a soft fade + rise. CSS-only (via
 * tw-animate-css) so content still renders if scripting is unavailable, and is
 * skipped under prefers-reduced-motion (`motion-safe:`). Stagger a group by
 * passing incrementing `delay`s (seconds).
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:fill-mode-both motion-safe:duration-500",
        className,
      )}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  )
}
