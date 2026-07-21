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

  return (
    <aside className="bg-sidebar text-sidebar-foreground hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="flex h-16 items-center px-6">
        <span className="font-display text-2xl font-semibold tracking-tight">
          Winnow
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {navItems.map((item) => {
          const active = isNavActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex items-center gap-2 border-t p-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{userName}</p>
        <ModeToggle />
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </aside>
  )
}
