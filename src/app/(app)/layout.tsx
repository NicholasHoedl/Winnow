import Link from "next/link"
import { redirect } from "next/navigation"
import { Search, Settings } from "lucide-react"

import { auth } from "@/lib/auth"
import { AI_READY } from "@/lib/config"
import { todayInZone } from "@/lib/date"
import { getEventOptions } from "@/modules/calendar/queries"
import { getGoalOptions } from "@/modules/goals/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getLists } from "@/modules/todos/queries"
import { AppSidebar } from "@/components/shared/app-sidebar"
import { BottomNav } from "@/components/shared/bottom-nav"
import { ModeToggle } from "@/components/shared/mode-toggle"
import {
  CommandPalette,
  CommandPaletteTrigger,
} from "@/components/create/command-palette"
import { CreateIntentProvider } from "@/components/create/create-intent"
import { GlobalCreateDialogs } from "@/components/create/global-create-dialogs"
import { DigestBanner } from "@/components/shared/digest-banner"
import { PreferencesProvider } from "@/components/preferences/preferences-provider"
import { AppearanceSync } from "@/components/theme/appearance-sync"
import { buttonVariants } from "@/components/ui/button"

// Authenticated app frame: responsive nav shell (desktop sidebar / mobile
// bottom tab bar) around the routed page. The session gate here is the
// authoritative check (the proxy is only a coarse pre-render redirect).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }

  const userName = session.user.name ?? "Account"
  const [preferences, lists, goals, events] = await Promise.all([
    getUserPreferences(),
    getLists(),
    getGoalOptions(),
    getEventOptions(),
  ])

  return (
    <CreateIntentProvider>
      <PreferencesProvider value={preferences}>
        {/* Renders nothing; reconciles this device's appearance with the account's. */}
        <AppearanceSync saved={{ theme: preferences.theme }} />
        <div className="flex min-h-svh flex-col md:flex-row">
          {/* Keyboard/screen-reader users can jump past the nav straight to the page. */}
          <a
            href="#content"
            className="bg-background text-foreground focus-visible:ring-ring sr-only rounded-md px-4 py-2 text-sm font-medium shadow focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:ring-2"
          >
            Skip to content
          </a>
          <AppSidebar userName={userName} companionEnabled={AI_READY} />

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile top bar (desktop puts the brand + toggle in the sidebar) */}
            <header className="flex h-14 items-center justify-between border-b px-4 md:hidden">
              <span className="font-display text-xl font-semibold tracking-tight">
                Winnow
              </span>
              <div className="flex items-center gap-1">
                <CommandPaletteTrigger
                  aria-label="Search"
                  className={buttonVariants({ variant: "ghost", size: "icon" })}
                >
                  <Search className="size-5" />
                </CommandPaletteTrigger>
                <Link
                  href="/settings"
                  aria-label="Settings"
                  className={buttonVariants({ variant: "ghost", size: "icon" })}
                >
                  <Settings className="size-5" />
                </Link>
                <ModeToggle />
              </div>
            </header>

            <main
              id="content"
              tabIndex={-1}
              className="flex-1 pb-20 outline-none md:pb-0"
            >
              {/* Renders itself (and its own spacing) only on the first visit of
                  a new local day; otherwise nothing at all. */}
              <DigestBanner
                userId={session.user.id}
                today={todayInZone(new Date(), preferences.timeZone)}
                enabled={preferences.digestEnabled}
                use24Hour={preferences.use24HourTime}
              />
              {children}
            </main>
          </div>

          <BottomNav companionEnabled={AI_READY} />
          <CommandPalette companionEnabled={AI_READY} />
          <GlobalCreateDialogs lists={lists} goals={goals} events={events} />
        </div>
      </PreferencesProvider>
    </CreateIntentProvider>
  )
}
