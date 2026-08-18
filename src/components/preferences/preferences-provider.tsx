"use client"

import * as React from "react"

import { dateLocale, type UserPreferences } from "@/lib/preferences"

// Server-seeded (from the app layout) so client components can read the
// display-affecting prefs (currency, time format, week start) without every
// server page prop-drilling them down.
const PreferencesContext = React.createContext<UserPreferences | null>(null)

export function PreferencesProvider({
  value,
  children,
}: {
  value: UserPreferences
  children: React.ReactNode
}) {
  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences(): UserPreferences {
  const ctx = React.useContext(PreferencesContext)
  if (!ctx) {
    throw new Error("usePreferences must be used within a PreferencesProvider")
  }
  return ctx
}

/**
 * The BCP-47 tag every date in a client component should be formatted with.
 *
 * A hook rather than reaching for `usePreferences().dateFormat` at each site, because the
 * thing a formatter wants is the locale and deriving it in twenty places is twenty chances
 * to derive it differently. `"en-US"` was hardcoded at every one of those sites before this
 * existed, which is exactly how currency ended up configurable while dates were not.
 */
export function useDateLocale(): string {
  return dateLocale(usePreferences().dateFormat)
}
