"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { ACTIVITY_PAGES } from "@/components/shared/activity-pages"
import { isNavActive } from "@/components/shared/nav-items"

/**
 * The strip of pills under the Activity heading, on every page of the section.
 *
 * The same control Settings uses — `<Link aria-current="page">` in a `bg-muted` pill
 * group, wrapping onto a second row on a phone rather than overflowing — because the two
 * should look like the same thing, and because that markup has been measured by both
 * layout sweeps. It is also the way back: the sub-pages' "← Activity" links went with it.
 *
 * Tasks is matched exactly rather than by prefix, since every other page here is under
 * `/activity` and a prefix match would light it everywhere.
 */
export function ActivityTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label="Activity sections">
      <div className="bg-muted inline-flex flex-wrap gap-0.5 rounded-lg p-0.5">
        {ACTIVITY_PAGES.map((page) => {
          const active =
            page.href === "/activity"
              ? pathname === page.href
              : isNavActive(pathname, page.href)
          return (
            <Link
              key={page.href}
              href={page.href}
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
