"use client"

// The shell every dashboard card sits in: a titled header, whatever links that card wants
// beside its title, and a chevron that folds the body away.
//
// A CLIENT component holding SERVER-RENDERED children, which is the whole reason this design
// works. `children` arrives as RSC output that the server already produced, so this file
// decides whether to show it without needing to render it — which means `CategoryBars` and
// the stat tiles stay server components, and the fold is instant rather than waiting on a
// Server Action plus `revalidatePath("/")` to redraw the entire dashboard.
//
// The alternative, a chevron as a small client island inside each server card, cannot do
// that: nothing on the client would own the content, so every toggle would be a round trip
// on the app's most-visited page.

import * as React from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type { DashboardCard as CardKey } from "@/lib/preferences"
import { setDashboardCard } from "@/modules/preferences/actions"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function DashboardCard({
  card,
  title,
  label,
  icon,
  collapsed,
  actions,
  children,
  className,
  contentClassName,
  headingClassName,
}: {
  card: CardKey
  /**
   * Shown as the card's heading, and the word the chevron's label is built from.
   *
   * A STRING, not a node. The chevron interpolates it into "Collapse X" / "Expand X", and
   * an icon smuggled in here would either land in that label or need stripping back out of
   * it — hence the separate `icon` slot below.
   */
  title: string
  /**
   * What to call this card in the chevron's label, when the heading is not a name.
   *
   * The calendar's heading is the month it is showing — "August 2026" — because
   * `dashboard-calendar-view.spec.ts` counts the `main h2`s matching a year and an en-dash,
   * and because a calendar that does not say which month it is on is useless. "Collapse
   * August 2026" is not what that control does, so it says "Collapse Calendar" instead.
   */
  label?: string
  /** Drawn before the heading, decorative. The stat tiles use it; nothing else does yet. */
  icon?: React.ReactNode
  collapsed: boolean
  /** Links belonging to this card, rendered between the title and the chevron. */
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
  headingClassName?: string
}) {
  const [, startTransition] = React.useTransition()
  // The server's value is the source of truth and arrives as a prop; this only covers the
  // gap while the write is in flight. `useOptimistic` resets to the prop once the transition
  // settles, so a failed write un-folds the card by itself rather than leaving the UI
  // asserting something the database disagrees with.
  const [open, setOpen] = React.useOptimistic(!collapsed)
  const name = label ?? title

  // Derived from the key so the two can never drift, and stable across renders so
  // `aria-controls` keeps pointing at the same node.
  const headingId = `card-${card}-heading`
  const bodyId = `card-${card}-body`

  function toggle() {
    startTransition(async () => {
      setOpen(!open)
      const result = await setDashboardCard(card, open)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <Card className={className} data-card={card}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          {icon && (
            <span className="text-muted-foreground shrink-0" aria-hidden>
              {icon}
            </span>
          )}
          {/* A real `<h2>`. `CardTitle` renders a `<div>`, so before this shell existed the
              dashboard had one hand-rolled heading in Slate and no heading at all on three
              other cards — six cards' worth of header markup agreeing on nothing. */}
          <h2
            id={headingId}
            className={cn(
              "min-w-0 flex-1 truncate text-base leading-snug font-medium",
              headingClassName,
            )}
          >
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-3">
            {actions}
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-controls={bodyId}
              // Named for what it will DO, not for what it is. "Collapse Slate" and
              // "Expand Slate" swap with the state, which is both what a screen reader
              // needs and what lets a test assert the toggle actually took.
              aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
              // NO negative margin. `-mr-1` here for optical alignment cost exactly 4px of
              // horizontal overflow at 393px: it pulls the flex row in while the button's
              // border box still occupies its full width, so the row's content is wider than
              // the row. Third time this pattern has bitten — see `habit-strip`,
              // `routines-line`, and Slate's routine block.
              className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1 transition-colors"
            >
              {open ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
          </div>
        </div>
      </CardHeader>
      {/* Not rendered at all when folded, rather than hidden with CSS. There is no animation
          to play out, and leaving a tall subtree mounted-but-invisible would keep its
          scroll containers and drag contexts alive underneath the page.

          The body is the `region` named by the heading, which is what makes
          `getByRole("region", { name: "Slate" })` keep resolving — Slate hand-built exactly
          that pairing in T16 and three other cards had no heading at all. Folding the card
          removes the region, which is the honest answer to "is Slate on the page?". */}
      {open && (
        <CardContent
          id={bodyId}
          role="region"
          aria-labelledby={headingId}
          className={contentClassName}
        >
          {children}
        </CardContent>
      )}
    </Card>
  )
}
