import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  ListTodo,
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
 * There is no `navItemsFor()` any more, and no Companion entry for it to splice in.
 *
 * The nav used to vary by whether the AI companion was configured, because `/companion`
 * was a whole PAGE that 404s when it is not — a tab for it would have been a dead link for
 * anyone who never turned the feature on. T13 dispersed those four jobs onto the pages of
 * the artifacts they produce and deleted that page, so nothing in the nav is conditional
 * on AI any longer: `/goals`, `/activity/routines`, `/review` and `/budget` all exist
 * regardless, and each gates its own tool on `aiReady` internally.
 *
 * `navItems` is the whole nav now. Import it directly.
 */

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
