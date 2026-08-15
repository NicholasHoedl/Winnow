import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  ListTodo,
  Sparkles,
  Target,
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
// Seven entries, and seven is the measured ceiling rather than a round number:
// `bottom-nav.tsx` is a plain flex with `flex-1` and no overflow handling, and seven labels
// fit a 375px phone with nothing to spare. An eighth needs a More sheet or a scroller
// first. Two slots have changed hands without changing the count — Notes → Review, and
// Companion → Goals — which is the only way anything gets in here now.
export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/activity", label: "Activity", icon: ListTodo },
  // Back after T10 merged it into Activity and T13 un-merged it. Directly after Activity
  // for the reason the Companion tab used to be: it is the thing next to the thing it
  // feeds, and `/activity?goal=` is the link between them.
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/meals", label: "Meals", icon: Utensils },
  // `/review` had no tab until now — the bar was at its ceiling, so the dashboard and
  // the palette were the only ways to reach it. Notes leaving freed the slot, and a
  // weekly read of your own figures earns it more than a second door to the dashboard.
  { href: "/review", label: "Review", icon: ClipboardList },
]

/**
 * The Companion, which **no longer has a tab** — Goals took its slot in T13 Phase 3.
 *
 * Still exported, and still conditional, because the command palette and the dashboard
 * button both still reach `/companion` while it exists. It is deleted in T13 Phase 4, and
 * this constant goes with it.
 *
 * Conditional matters for those remaining doors: `/companion` 404s unless the feature is
 * configured in Settings (ADR-0011, moved out of the environment in T11), so an
 * unconditional entry would be a dead link for anyone who never turned it on.
 */
export const COMPANION_NAV_ITEM: NavItem = {
  href: "/companion",
  label: "Companion",
  icon: Sparkles,
}

/**
 * The nav as actually rendered.
 *
 * **It no longer varies**, and the parameter is kept only so the call sites can stay put
 * across Phase 4, which deletes both. Every page now gates its own AI tool on `aiReady`
 * rather than the nav gating a whole page — which is the better shape: the goals page
 * exists whether or not you have a provider configured, because goals are not an AI
 * feature.
 */
export function navItemsFor(_companionEnabled: boolean): NavItem[] {
  return navItems
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
