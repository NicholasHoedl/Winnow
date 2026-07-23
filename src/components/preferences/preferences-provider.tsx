"use client"

import * as React from "react"

import type { UserPreferences } from "@/lib/preferences"

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
