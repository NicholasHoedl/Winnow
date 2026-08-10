import {
  CalendarDays,
  LayoutDashboard,
  ListTodo,
  NotebookPen,
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
// Six since T10 (ADR-0013): To-dos and Goals merged into Activity, which frees the first
// slot this bar has had since it filled up at seven. It is deliberately left free — an
// eighth entry needed a More sheet or a scroller first, and that pressure is worth keeping
// off until something genuinely earns a tab.
export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/activity", label: "Activity", icon: ListTodo },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/meals", label: "Meals", icon: Utensils },
  { href: "/notes", label: "Notes", icon: NotebookPen },
]

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
