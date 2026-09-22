// About this file: the app's main navigation destinations, defined once. The desktop
// sidebar, the phone tab bar and its More sheet, the command palette and the landing-page
// setting all read these lists.
//
// What you'll find here:
// - `PhonePlacement`, `NavItem`: a destination's place on a phone, and the destination.
// - `navItems`: the main destinations, in sidebar order.
// - `SETTINGS_ITEM`: Settings, for the phone's More sheet.
// - `phoneTabs`, `phoneMore`: what the phone tab bar and the More sheet show.
// - `isNavActive`: whether a link matches the current path.
// - `isMoreActive`: whether the More tab is lit.
//
// Related: `bottom-nav.tsx`, the phone tab bar and More sheet drawn from these lists.

import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  ListTodo,
  Settings,
  Target,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react"

/** Where a destination lives on a phone: in the tab bar, or in the sheet behind More. */
export type PhonePlacement = "tab" | "more"

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  phone: PhonePlacement
}

// Shared by the desktop sidebar and the mobile bottom tab bar so both stay in
// sync (the "truly equal" responsive decision — one nav, two presentations).
//
// The sidebar shows all seven. A phone shows the four used every day in its tab bar and
// puts the rest behind More (T35, ADR-0029). Seven used to be the whole bar because seven
// was the most that physically fit a 375px phone (ADR-0013); Material's navigation bar is
// for three to five destinations and Apple's tab bar hands the rest to a More tab. `phone`
// is set by how often each place is used, from the UX review's flow tiers, not by what
// fits — and `nav-items.test.ts` holds the bar to five slots with More.
export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, phone: "tab" },
  { href: "/activity", label: "Activity", icon: ListTodo, phone: "tab" },
  // Back after T10 merged it into Activity and T13 un-merged it. Directly after Activity
  // for the reason the Companion tab used to be: it is the thing next to the thing it
  // feeds, and `/activity?goal=` is the link between them.
  { href: "/goals", label: "Goals", icon: Target, phone: "more" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, phone: "more" },
  { href: "/budget", label: "Budget", icon: Wallet, phone: "tab" },
  { href: "/meals", label: "Meals", icon: Utensils, phone: "tab" },
  // A weekly read of your own figures. Under More on a phone, where the dashboard's own
  // Review button stays one tap away.
  { href: "/review", label: "Review", icon: ClipboardList, phone: "more" },
]

/**
 * Settings, for the sheet behind More.
 *
 * Not in `navItems`: the sidebar reaches it from the gear beside your name, which is where
 * web apps keep an account's settings. A phone used to reach it from an unlabelled gear in
 * the header on every screen; under More it has a label, which is where both platforms keep
 * it, and the header is left with the brand and Search.
 */
export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: Settings,
  phone: "more",
}

/** The phone's tab bar, in the sidebar's order. More is the fifth slot. */
export const phoneTabs: NavItem[] = navItems.filter(
  (item) => item.phone === "tab",
)

/** The sheet behind More: the weekly destinations in the sidebar's order, then Settings. */
export const phoneMore: NavItem[] = [
  ...navItems.filter((item) => item.phone === "more"),
  SETTINGS_ITEM,
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

/** Whether More is lit: the page on show is one of the places it holds. */
export function isMoreActive(pathname: string): boolean {
  return phoneMore.some((item) => isNavActive(pathname, item.href))
}
