"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { BUDGET_PAGES, withMonth } from "@/components/shared/budget-pages"
import { isNavActive } from "@/components/shared/nav-items"

/**
 * The strip of pills under the Budget heading, on every page of the section — the same
 * control the Activity and Settings sections use, so the three read as the same thing and
 * its markup has been measured by both layout sweeps. It is also the way back.
 *
 * `month` rides on every pill (see `withMonth`), which is the one thing this strip does
 * that the Activity one does not: that section has no month, this one is nothing but.
 * Transactions is matched exactly rather than by prefix, since every other page here is
 * under `/budget` and a prefix match would light it everywhere.
 */
export function BudgetTabs({ month }: { month: string | null }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Budget sections">
      <div className="bg-muted inline-flex flex-wrap gap-0.5 rounded-lg p-0.5">
        {BUDGET_PAGES.map((page) => {
          const active =
            page.href === "/budget"
              ? pathname === page.href
              : isNavActive(pathname, page.href)
          return (
            <Link
              key={page.href}
              href={withMonth(page.href, month)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <page.icon className="size-3.5" />
              {page.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
