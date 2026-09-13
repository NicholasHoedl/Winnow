import { redirect } from "next/navigation"
import { Search } from "lucide-react"

import { auth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { todayInZone } from "@/lib/date"
import { getEventOptions } from "@/modules/calendar/queries"
import { computeDigest } from "@/modules/digest/queries"
import { getGoalOptions } from "@/modules/goals/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getLists } from "@/modules/todos/queries"
import { AppSidebar } from "@/components/shared/app-sidebar"
import { BrandMark } from "@/components/shared/brand-mark"
import { BottomNav } from "@/components/shared/bottom-nav"
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
  // `computeDigest()` rides along here rather than being fetched by the banner from an
  // effect (T45). It reads `getUserPreferences()` itself, which is `cache()`d — so the two
  // entries share one query — and returns null the moment the digest preference is off,
  // before any of its three aggregations run.
  const [preferences, lists, goals, events, digest] = await Promise.all([
    getUserPreferences(),
    getLists(),
    getGoalOptions(),
    getEventOptions(),
    computeDigest(),
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
            {/* Mobile top bar: the brand and Search. Settings moved into the tab bar's More
                sheet, with a label, and the theme toggle lives on the Appearance page; both
                were rare choices sitting on every screen (T35, ADR-0029). The desktop
                sidebar keeps its gear and its toggle. */}
            <header className="flex h-14 items-center justify-between border-b px-4 md:hidden">
              <span className="flex items-center gap-2">
                <BrandMark
                  className="size-6 shrink-0"
                  tile="var(--primary)"
                  ink="var(--primary-foreground)"
                />
                <span className="font-display text-xl font-semibold tracking-tight">
                  Winnow
                </span>
              </span>
              <div className="flex items-center gap-1">
                <CommandPaletteTrigger
                  aria-label="Search"
                  // `cn(...)` like every other call site. Ghost sets no border, so this
                  // one never showed the bug the outline links had — and wrapping it is
                  // what stops a later change of variant from bringing it back (T39).
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "icon" }),
                  )}
                >
                  <Search className="size-5" />
                </CommandPaletteTrigger>
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
              {/* Shows itself (and its own spacing) only on the first visit of a new
                  local day; otherwise it renders hidden, since only this device knows
                  whether today's has been had. Nothing at all when there is no digest. */}
              <DigestBanner
                userId={session.user.id}
                today={todayInZone(new Date(), preferences.timeZone)}
                digest={digest}
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
