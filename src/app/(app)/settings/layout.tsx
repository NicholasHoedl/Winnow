import type * as React from "react"

import { SettingsTabs } from "./_components/settings-tabs"

/**
 * The frame every settings page shares: the heading and the strip of pills.
 *
 * Settings was one page of seven stacked cards until it was split by subject — a page you
 * could not scan for the one setting you wanted. Each subject is a route now, this layout
 * is what makes them read as one place, and `loading.tsx` beside it covers every child, so
 * navigating between pages keeps the heading and tabs and only the card area waits.
 *
 * `isNavActive` prefix-matches, so the sidebar's Settings entry stays lit on every page
 * under here without anything being told.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Settings
        </h1>
      </header>
      <SettingsTabs />
      {children}
    </div>
  )
}
