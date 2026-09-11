"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Ellipsis } from "lucide-react"

import { cn } from "@/lib/utils"
import { LinkPending } from "@/components/shared/link-pending"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

import { isMoreActive, isNavActive, phoneMore, phoneTabs } from "./nav-items"

/**
 * One slot of the bar. Shared by the four tabs and More so the five are the same box —
 * `navigation.spec.ts` measures their heights equal. `text-xs` rather than the 0.65rem the
 * bar used when it had to fit seven labels at 375px.
 */
const SLOT =
  "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors"

/**
 * The phone's navigation: the four places used every day, and More (T35, ADR-0029).
 *
 * More opens a sheet from the bottom holding the weekly places and Settings, and is lit
 * while you are on one of them, the way a More tab behaves on iOS. The sheet closes when a
 * place is picked; its rows are full-width and at least 48px tall, so they are easier to hit
 * than the tabs they replaced.
 */
export function BottomNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = React.useState(false)
  const moreActive = isMoreActive(pathname)

  return (
    <nav className="bg-background fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden">
      {phoneTabs.map((item) => {
        const active = isNavActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              SLOT,
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            {/* On a cold prefetch nothing at all happens until the RSC payload lands, so
                the icon turns into a spinner of the same size while it does. */}
            <LinkPending className="size-5">
              <item.icon className="size-5" />
            </LinkPending>
            {item.label}
          </Link>
        )
      })}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger
          data-active={moreActive ? "true" : "false"}
          className={cn(
            SLOT,
            moreActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Ellipsis className="size-5" aria-hidden />
          More
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="gap-0 rounded-t-xl pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="pb-2">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <ul className="flex flex-col px-2 pb-4">
            {phoneMore.map((item) => {
              const active = isNavActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors",
                      active
                        ? "bg-accent text-primary"
                        : "text-foreground hover:bg-accent",
                    )}
                  >
                    <item.icon className="size-5" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
