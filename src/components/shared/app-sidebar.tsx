"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { signOutAction } from "@/app/(app)/actions"

import { isNavActive, navItems } from "./nav-items"
import { ModeToggle } from "./mode-toggle"

export function AppSidebar({ userName }: { userName: string }) {
  const pathname = usePathname()
  const initial = userName.charAt(0).toUpperCase() || "?"

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

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {navItems.map((item) => {
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
              <item.icon
                className={cn("size-4", active && "text-sidebar-primary")}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-sidebar-border flex items-center justify-between gap-2 border-t p-3">
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
    </aside>
  )
}
