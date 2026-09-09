"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { isNavActive } from "@/components/shared/nav-items"

import { SETTINGS_PAGES } from "@/components/shared/settings-pages"

/**
 * The strip of pills across the top of every settings page.
 *
 * Modelled on the calendar's view toggle — `<Link aria-current="page">` in a `bg-muted`
 * pill group — because that markup has already been measured by both layout sweeps and
 * because the two should look like the same control. One difference: `flex-wrap` here, so
 * seven pills wrap onto a second row on a phone rather than overflowing it. The sweep
 * treats a scroller as a design and would not have caught the alternative.
 *
 * A client component only because `aria-current` needs the pathname. That is also what
 * lets it hide itself on the overview, where a row of tabs above a grid of cards would be
 * the same seven things twice.
 */
export function SettingsTabs() {
  const pathname = usePathname()
  if (pathname === "/settings") return null

  return (
    <nav aria-label="Settings sections" className="mb-6">
      <div className="bg-muted inline-flex flex-wrap gap-0.5 rounded-lg p-0.5">
        {SETTINGS_PAGES.map((page) => {
          const active = isNavActive(pathname, page.href)
          return (
            <Link
              key={page.href}
              href={page.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {page.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
