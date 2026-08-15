import Link from "next/link"
import { redirect } from "next/navigation"
import { Search, Settings } from "lucide-react"

import { auth } from "@/lib/auth"
import { todayInZone } from "@/lib/date"
import { getEventOptions } from "@/modules/calendar/queries"
import { getGoalOptions } from "@/modules/goals/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getLists } from "@/modules/todos/queries"
import { AppSidebar } from "@/components/shared/app-sidebar"
import { BottomNav } from "@/components/shared/bottom-nav"
import { LinkPending } from "@/components/shared/link-pending"
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
  // No `getAiSettings()` here any more. The shell used to read it to decide whether the
  // Companion got a nav tab; T13 dispersed those jobs onto the pages of their artifacts and
  // deleted that page, so the nav no longer varies by AI state and each page reads the
  // setting itself. One query fewer on every authenticated render, and no value with no
  // reader — which is the same anti-pattern as a column with no writer.
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
          <AppSidebar userName={userName} />

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
                  {/* Works from this SERVER component because `LinkPending` takes
                      children rather than an icon prop — a lucide component passed as a
                      prop would be a function crossing the RSC boundary. */}
                  <LinkPending className="size-5">
                    <Settings className="size-5" />
                  </LinkPending>
                </Link>
                <ModeToggle />
              </div>
            </header>

            <main
              id="content"
              tabIndex={-1}
              // Clears the fixed BottomNav, plus the gap the old `pb-20` was really
              // buying. That 5rem was a guess made against a nav measuring 54px, and it
              // held until `env(safe-area-inset-bottom)` stopped being zero: on an iPhone
              // the nav is ~88px, so the last few pixels of every page sat underneath it.
              className="flex-1 pb-[calc(var(--bottom-nav-height)_+_1.5rem)] outline-none md:pb-0"
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

          <BottomNav />
          <CommandPalette />
          <GlobalCreateDialogs lists={lists} goals={goals} events={events} />
        </div>
      </PreferencesProvider>
    </CreateIntentProvider>
  )
}
