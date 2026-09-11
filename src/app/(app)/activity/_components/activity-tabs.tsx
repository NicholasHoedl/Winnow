"use client"

import { usePathname } from "next/navigation"

import { ACTIVITY_PAGES } from "@/components/shared/activity-pages"
import { isNavActive } from "@/components/shared/nav-items"
import { PageTabs } from "@/components/shared/page-tabs"

/**
 * The strip of pills under the Activity heading, on every page of the section. It is also
 * the way back: the sub-pages' "← Activity" links went with it. Drawn by `PageTabs`, which
 * Budget and Settings share, as one row that scrolls on a phone (T35, ADR-0029).
 *
 * Tasks is matched exactly rather than by prefix, since every other page here is under
 * `/activity` and a prefix match would light it everywhere.
 */
export function ActivityTabs() {
  const pathname = usePathname()
  return (
    <PageTabs
      label="Activity sections"
      tabs={ACTIVITY_PAGES.map((page) => ({
        href: page.href,
        label: page.label,
        icon: page.icon,
        active:
          page.href === "/activity"
            ? pathname === page.href
            : isNavActive(pathname, page.href),
      }))}
    />
  )
}
