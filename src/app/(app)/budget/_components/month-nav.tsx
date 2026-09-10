"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { shiftMonth } from "@/lib/date"
import { buttonVariants } from "@/components/ui/button"
import { DateJumpButton } from "@/components/shared/date-jump-button"
import { LinkPending } from "@/components/shared/link-pending"
import { useDateLocale } from "@/components/preferences/preferences-provider"

function formatMonth(month: string, locale: string): string {
  const [year, m] = month.split("-").map(Number)
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

/**
 * Previous, next, jump, and back to this month — on whichever Budget page is showing.
 *
 * The links are built from the current path, so moving a month keeps you on the page you
 * are reading rather than sending you to the ledger. It lived in `BudgetView` until T30,
 * when the section split into pages that all read the same month.
 */
export function MonthNav({
  month,
  currentMonth,
}: {
  month: string
  currentMonth: string
}) {
  const pathname = usePathname()
  const locale = useDateLocale()
  const to = (m: string) => `${pathname}?month=${m}`

  return (
    <div className="mt-4 flex items-center justify-center gap-1">
      <Link
        href={to(shiftMonth(month, -1))}
        aria-label="Previous month"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
      >
        {/* Same-route param change: the segment is not remounted, so `loading.tsx`
            never fires and nothing else in the app indicates this. */}
        <LinkPending className="size-4">
          <ChevronLeft className="size-4" />
        </LinkPending>
      </Link>
      <span className="min-w-40 text-center text-sm font-medium">
        {formatMonth(month, locale)}
      </span>
      <Link
        href={to(shiftMonth(month, 1))}
        aria-label="Next month"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
      >
        <LinkPending className="size-4">
          <ChevronRight className="size-4" />
        </LinkPending>
      </Link>
      <DateJumpButton
        selected={`${month}-01`}
        hrefFor={(d) => to(d.slice(0, 7))}
        ariaLabel="Jump to a month"
      />
      {month !== currentMonth && (
        <Link
          href={pathname}
          className={cn(buttonVariants({ variant: "link", size: "sm" }))}
        >
          This month
        </Link>
      )}
    </div>
  )
}
