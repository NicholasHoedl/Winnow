import {
  CalendarDays,
  LayoutDashboard,
  ListTodo,
  NotebookPen,
  Sparkles,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

// Shared by the desktop sidebar and the mobile bottom tab bar so both stay in
// sync (the "truly equal" responsive decision — one nav, two presentations).
//
// The UNCONDITIONAL entries. T10 merged To-dos and Goals into Activity and left this at
// six; the Companion below spends that freed slot, putting the bar back at seven — which
// is the measured ceiling, not a round number. `bottom-nav.tsx` is a plain flex with
// `flex-1` and no overflow handling, and seven labels fit a 375px phone with nothing to
// spare. An eighth needs a More sheet or a scroller first.
export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/activity", label: "Activity", icon: ListTodo },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/meals", label: "Meals", icon: Utensils },
  { href: "/notes", label: "Notes", icon: NotebookPen },
]

/**
 * The Companion tab, kept out of `navItems` because it is **conditional**.
 *
 * `/companion` only exists when `AI_ENABLED` is set with a provider configured (ADR-0011);
 * with it off the route 404s. A tab in the static list would therefore be a permanent dead
 * link for anyone who never turned the feature on — the same reason the command palette has
 * always listed it separately rather than spreading it into `navItems`.
 */
export const COMPANION_NAV_ITEM: NavItem = {
  href: "/companion",
  label: "Companion",
  icon: Sparkles,
}

/**
 * The nav as actually rendered, given whether the companion is configured.
 *
 * Placed directly after Activity: the companion's four jobs all propose work that lands in
 * Activity, so it reads as the thing next to the thing it feeds.
 */
export function navItemsFor(companionEnabled: boolean): NavItem[] {
  if (!companionEnabled) return navItems
  const at = navItems.findIndex((item) => item.href === "/activity")
  // Appends rather than throwing if Activity is ever renamed — a nav that quietly loses its
  // ordering is better than one that crashes the whole shell.
  const index = at === -1 ? navItems.length : at + 1
  return [
    ...navItems.slice(0, index),
    COMPANION_NAV_ITEM,
    ...navItems.slice(index),
  ]
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
