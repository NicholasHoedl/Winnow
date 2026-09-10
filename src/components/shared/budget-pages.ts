import {
  ArrowLeftRight,
  BarChart3,
  FolderCog,
  Wallet,
  type LucideIcon,
} from "lucide-react"

/**
 * The Budget section's pages, in the order the strip shows them.
 *
 * One list, two readers — the tab strip and the command palette — for the reason
 * `activity-pages.ts` and `settings-pages.ts` give: two hand-written lists that must agree
 * drift silently.
 *
 * Until T30 the whole section was one page: the month's stats, the by-category bars, the
 * ledger, the AI import and two charts in a column, with the category manager and the
 * budgets editor in an unlabeled ⋮ menu. ADR-0024 is why they are destinations in a strip
 * now, as ADR-0020 made the Activity tools.
 *
 * Beside `nav-items.ts` rather than under the route, for the reason the other two lists
 * live here: the palette reads it, and a shared component reaching into a route's private
 * `_components` folder is the coupling that folder name exists to forbid.
 */
export type BudgetPage = {
  href: "/budget" | `/budget/${string}`
  label: string
  icon: LucideIcon
}

export const BUDGET_PAGES: readonly BudgetPage[] = [
  { href: "/budget", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budget/budgets", label: "Budgets", icon: Wallet },
  { href: "/budget/categories", label: "Categories", icon: FolderCog },
  { href: "/budget/trends", label: "Trends", icon: BarChart3 },
]

const MONTH_RE = /^\d{4}-\d{2}$/

/**
 * A pill's href with the month in view carried along.
 *
 * The section is read one month at a time, and a pill that dropped you back to this month
 * would make "switch page, pick the month again" one gesture too many. Anything that is
 * not a `YYYY-MM` is left off rather than passed through — the pages validate the param
 * themselves, but a link should not carry what it knows is junk.
 */
export function withMonth(
  href: string,
  month: string | null | undefined,
): string {
  return month && MONTH_RE.test(month) ? `${href}?month=${month}` : href
}
