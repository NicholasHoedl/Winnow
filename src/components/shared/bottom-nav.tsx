"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { LinkPending } from "@/components/shared/link-pending"

import { isNavActive, navItemsFor } from "./nav-items"

export function BottomNav({ companionEnabled }: { companionEnabled: boolean }) {
  const pathname = usePathname()
  const items = navItemsFor(companionEnabled)

  return (
    <nav className="bg-background fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map((item) => {
        const active = isNavActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-[0.65rem] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            {/* The primary nav on a phone, and the reason this exists: on a cold
                prefetch nothing at all happens until the RSC payload lands. Icon-only —
                `navigation.spec.ts` pins the seven labels and equal link heights, and a
                `size-5` spinner is the same box as a `size-5` icon. */}
            <LinkPending className="size-5">
              <item.icon className="size-5" />
            </LinkPending>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
