"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { addDays } from "@/lib/date"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { DateJumpButton } from "@/components/shared/date-jump-button"
import { LinkPending } from "@/components/shared/link-pending"

/**
 * Previous week, the week, next week, a jump, and back to this week (T35).
 *
 * The same shape as the day control on Meals and the month control on Budget: ghost
 * chevrons either side of a centred label, the date-picker jump, and a link home when you
 * are away from it. Review used two bordered arrow buttons in its header's corner, the
 * one date control in the app that looked different.
 *
 * A client component only because `DateJumpButton` takes a function, and the review page is
 * a server component that cannot pass one across. `flex-wrap`, because the week's label is
 * the longest of the three and "This week" beside the jump can crowd a 393px row.
 */
export function WeekNav({
  weekStart,
  range,
  isCurrentWeek,
}: {
  /** 'YYYY-MM-DD', the first day of the week on show. */
  weekStart: string
  /** The week as it is written in the header, e.g. "Sep 6 – Sep 12, 2026". */
  range: string
  isCurrentWeek: boolean
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-center gap-1">
      <Link
        href={`/review?week=${addDays(weekStart, -7)}`}
        aria-label="Previous week"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
      >
        {/* Same-route param change: the segment is not remounted, so `loading.tsx`
            never fires and nothing else in the app indicates this. */}
        <LinkPending className="size-4">
          <ChevronLeft className="size-4" />
        </LinkPending>
      </Link>
      <span className="min-w-40 text-center text-sm font-medium">{range}</span>
      <Link
        href={`/review?week=${addDays(weekStart, 7)}`}
        aria-label="Next week"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
      >
        <LinkPending className="size-4">
          <ChevronRight className="size-4" />
        </LinkPending>
      </Link>
      <DateJumpButton
        selected={weekStart}
        hrefFor={(day) => `/review?week=${day}`}
        ariaLabel="Jump to a week"
      />
      {!isCurrentWeek && (
        <Link
          href="/review"
          className={cn(buttonVariants({ variant: "link", size: "sm" }))}
        >
          This week
        </Link>
      )}
    </div>
  )
}
