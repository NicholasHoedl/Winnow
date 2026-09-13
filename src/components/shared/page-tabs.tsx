"use client"

import * as React from "react"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type PageTab = {
  href: string
  label: string
  icon?: LucideIcon
  active: boolean
}

/**
 * The strip of pills under a section's heading, on Activity, Budget and Settings (T35).
 *
 * One component where there were three copies of the same markup, each with its own note
 * saying the three should look like the same control. Each section still decides which
 * pill is lit, since their matching rules differ, and hands this the result.
 *
 * **One row that scrolls sideways, not pills that wrap** (ADR-0029). Five pills took two
 * rows on a phone with "Repeating tasks" alone on the second, and Settings' seven took two
 * as well; a single row that scrolls is the familiar shape for page tabs on a phone.
 * `overflow-x-auto` is written into the class list on purpose: the layout sweep reads intent
 * from the class list and treats a named horizontal scroller as a design, not a spill.
 *
 * The lit pill is scrolled into view, since a current page that starts off-screen is the
 * one way this pattern can hide where you are. Only the strip scrolls; the page never moves.
 */
export function PageTabs({
  label,
  tabs,
  className,
}: {
  /** The accessible name of the strip, e.g. "Activity sections". */
  label: string
  tabs: PageTab[]
  className?: string
}) {
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const activeHref = tabs.find((tab) => tab.active)?.href

  React.useEffect(() => {
    const scroller = scrollerRef.current
    const active = scroller?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!scroller || !active) return
    // Measured against the strip rather than with `scrollIntoView`, which would also scroll
    // the page to bring the strip itself into view.
    const box = scroller.getBoundingClientRect()
    const pill = active.getBoundingClientRect()
    if (pill.left < box.left) scroller.scrollLeft -= box.left - pill.left + 8
    else if (pill.right > box.right)
      scroller.scrollLeft += pill.right - box.right + 8
  }, [activeHref])

  return (
    <nav aria-label={label} className={className}>
      <div
        ref={scrollerRef}
        className="bg-muted flex w-fit max-w-full [scrollbar-width:none] gap-0.5 overflow-x-auto rounded-lg p-0.5 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              // Not prefetched (T45). A strip of five to seven pills is five to seven
              // viewport links, and on a dynamic route — every route here is, since
              // `auth()` reads cookies — Next's client router cache holds a prefetched
              // payload for zero seconds. So the tap refetches the page anyway and the
              // prefetch bought nothing but the loading skeleton. `LinkPending` is what
              // covers the wait, and it works whether or not a prefetch ran.
              prefetch={false}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
                tab.active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {Icon && <Icon className="size-3.5" />}
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
