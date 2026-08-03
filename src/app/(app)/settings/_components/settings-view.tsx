"use client"

import type { UserPreferences } from "@/lib/preferences"

import { AccountSection } from "./account-section"
import { AppearanceSection } from "./appearance-section"
import { CalendarSection } from "./calendar-section"
import { DataSection } from "./data-section"
import { NotificationsSection } from "./notifications-section"
import { PreferencesSection } from "./preferences-section"

export function SettingsView({
  user,
  preferences,
  feedUrl,
}: {
  user: { name: string; email: string }
  preferences: UserPreferences
  feedUrl: string
}) {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage your account, appearance, and preferences.
        </p>
      </header>

      <div className="flex flex-col gap-8">
        <AccountSection defaultName={user.name} email={user.email} />
        <AppearanceSection />
        <PreferencesSection preferences={preferences} />
        <NotificationsSection preferences={preferences} />
        <CalendarSection feedUrl={feedUrl} />
        <DataSection />
      </div>
    </div>
  )
}
