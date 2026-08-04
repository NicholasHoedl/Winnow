import {
  CalendarDays,
  LayoutDashboard,
  ListTodo,
  NotebookPen,
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
export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/todos", label: "To-dos", icon: ListTodo },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/meals", label: "Meals", icon: Utensils },
  { href: "/notes", label: "Notes", icon: NotebookPen },
]

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
