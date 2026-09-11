"use client"

import { usePathname } from "next/navigation"

import { BUDGET_PAGES, withMonth } from "@/components/shared/budget-pages"
import { isNavActive } from "@/components/shared/nav-items"
import { PageTabs } from "@/components/shared/page-tabs"

/**
 * The strip of pills under the Budget heading, on every page of the section, and the way
 * back. Drawn by `PageTabs`, which Activity and Settings share, as one row that scrolls on a
 * phone (T35, ADR-0029).
 *
 * `month` rides on every pill (see `withMonth`), which is the one thing this strip does
 * that the Activity one does not: that section has no month, this one is nothing but.
 * Transactions is matched exactly rather than by prefix, since every other page here is
 * under `/budget` and a prefix match would light it everywhere.
 */
export function BudgetTabs({ month }: { month: string | null }) {
  const pathname = usePathname()
  return (
    <PageTabs
      label="Budget sections"
      tabs={BUDGET_PAGES.map((page) => ({
        href: withMonth(page.href, month),
        label: page.label,
        icon: page.icon,
        active:
          page.href === "/budget"
            ? pathname === page.href
            : isNavActive(pathname, page.href),
      }))}
    />
  )
}
