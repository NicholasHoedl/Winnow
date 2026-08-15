"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut, Search, Settings } from "lucide-react"

import { cn } from "@/lib/utils"
import { LinkPending } from "@/components/shared/link-pending"
import { Button } from "@/components/ui/button"
import { CommandPaletteTrigger } from "@/components/create/command-palette"
import { signOutAction } from "@/app/(app)/actions"

import { isNavActive, navItems } from "./nav-items"
import { ModeToggle } from "./mode-toggle"

export function AppSidebar({ userName }: { userName: string }) {
  const pathname = usePathname()
  const items = navItems
  const initial = userName.charAt(0).toUpperCase() || "?"
  const settingsActive = isNavActive(pathname, "/settings")

  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="flex h-16 items-center gap-2 px-6">
        <span className="bg-sidebar-primary text-sidebar-primary-foreground flex size-6 items-center justify-center rounded-md text-xs font-bold">
          W
        </span>
        <span className="font-display text-2xl font-semibold tracking-tight">
          Winnow
        </span>
      </div>

      {/* Profile block */}
      <div className="px-3">
        <div className="bg-sidebar-accent/50 flex items-center gap-3 rounded-lg px-3 py-2.5">
          <span className="bg-sidebar-primary text-sidebar-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="text-sidebar-foreground/55 truncate text-xs">
              Personal space
            </p>
          </div>
        </div>
      </div>

      {/* Command palette trigger */}
      <div className="px-3 pt-3">
        <CommandPaletteTrigger
          className="bg-sidebar-accent/40 text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
          aria-label="Search"
        >
          <Search className="size-4" />
          <span>Search…</span>
          <kbd className="border-sidebar-border text-sidebar-foreground/50 ml-auto rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none">
            Ctrl K
          </kbd>
        </CommandPaletteTrigger>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {items.map((item) => {
          const active = isNavActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              {/* Icon-only swap. `navigation.spec.ts` asserts the nav's exact innerText
                  and `sr-only` clips rather than hiding, so added text would break it. */}
              <LinkPending className="size-4">
                <item.icon
                  className={cn("size-4", active && "text-sidebar-primary")}
                />
              </LinkPending>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-sidebar-border flex flex-col gap-1 border-t p-3">
        <Link
          href="/settings"
          aria-current={settingsActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            settingsActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
          )}
        >
          <LinkPending className="size-4">
            <Settings
              className={cn("size-4", settingsActive && "text-sidebar-primary")}
            />
          </LinkPending>
          Settings
        </Link>
        <div className="flex items-center justify-between gap-2 pt-1">
          <ModeToggle />
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </aside>
  )
}
