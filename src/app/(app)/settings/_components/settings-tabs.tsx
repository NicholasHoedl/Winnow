"use client"

import { usePathname } from "next/navigation"

import { isNavActive } from "@/components/shared/nav-items"
import { PageTabs } from "@/components/shared/page-tabs"

import { SETTINGS_PAGES } from "@/components/shared/settings-pages"

/**
 * The strip of pills across the top of every settings page. Drawn by `PageTabs`, which
 * Activity and Budget share, as one row that scrolls on a phone (T35, ADR-0029); it used to
 * wrap its seven pills onto a second row there.
 *
 * Labels only, where the other two strips carry icons: the overview's cards show the icons,
 * and seven of them in a row would be noise.
 *
 * A client component only because `aria-current` needs the pathname. That is also what
 * lets it hide itself on the overview, where a row of tabs above a grid of cards would be
 * the same seven things twice.
 */
export function SettingsTabs() {
  const pathname = usePathname()
  if (pathname === "/settings") return null

  return (
    <PageTabs
      label="Settings sections"
      className="mb-6"
      tabs={SETTINGS_PAGES.map((page) => ({
        href: page.href,
        label: page.label,
        active: isNavActive(pathname, page.href),
      }))}
    />
  )
}
