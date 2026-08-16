import Link from "next/link"
import { ArrowUpRight, Utensils, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatCents, type MonthSummary } from "@/modules/budget/service"
import type { MacroProgressSet } from "@/modules/meals/service"

import { DashboardCard } from "./dashboard-card"

const MACROS = [
  { key: "calories", label: "Cal", accent: "bg-cat-3" },
  { key: "protein", label: "Protein", accent: "bg-cat-1" },
  { key: "carbs", label: "Carbs", accent: "bg-cat-5" },
  { key: "fat", label: "Fat", accent: "bg-cat-4" },
] as const

/**
 * One stat tile.
 *
 * The whole tile used to be a single `<Link>`. It cannot be any more: a collapse chevron is
 * a `<button>`, and a button inside an anchor is invalid per the HTML content model — the
 * browser is entitled to do whatever it likes with the nesting, and in practice clicking the
 * chevron would navigate as well as fold.
 *
 * So the link moved to the header's arrow, which is where the affordance already pointed,
 * and the tile became a `DashboardCard` like every other surface here. The trade is real and
 * worth naming: the click target for "go to /meals" shrank from a whole tile to an icon.
 */
function StatShell({
  card,
  href,
  icon,
  label,
  collapsed,
  children,
}: {
  card: "macros" | "budget"
  href: string
  icon: React.ReactNode
  label: string
  collapsed: boolean
  children: React.ReactNode
}) {
  return (
    <DashboardCard
      card={card}
      title={label}
      icon={icon}
      collapsed={collapsed}
      headingClassName="text-muted-foreground text-sm font-medium"
      actions={
        <Link
          href={href}
          aria-label={`Open ${label}`}
          className="text-muted-foreground/50 hover:text-foreground -m-1 rounded-md p-1 transition-colors"
        >
          <ArrowUpRight className="size-4" />
        </Link>
      }
    >
      {children}
    </DashboardCard>
  )
}

function Bar({ percent, accent }: { percent: number; accent: string }) {
  return (
    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
      <div
        className={cn("h-full rounded-full", accent)}
        style={{ width: `${Math.max(2, Math.min(percent, 100))}%` }}
      />
    </div>
  )
}

export function StatCards({
  macros,
  budget,
  currency,
  collapsed,
}: {
  macros: { progress: MacroProgressSet }
  budget: MonthSummary
  currency: string
  /** The two tiles fold independently, so this is a pair rather than one flag. */
  collapsed: { macros: boolean; budget: boolean }
}) {
  const nothingLogged = MACROS.every(
    ({ key }) => macros.progress[key].consumed === 0,
  )
  const budgetPercent =
    budget.totalBudgetedCents > 0
      ? Math.round((budget.expenseCents / budget.totalBudgetedCents) * 100)
      : 0
  const overBudget =
    budget.totalBudgetedCents > 0 &&
    budget.expenseCents > budget.totalBudgetedCents

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Macros */}
      <StatShell
        card="macros"
        href="/meals"
        icon={<Utensils className="size-4" />}
        label="Macros"
        collapsed={collapsed.macros}
      >
        {nothingLogged ? (
          <p className="text-muted-foreground flex flex-1 items-center text-sm">
            Nothing logged today.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {MACROS.map(({ key, label, accent }) => {
              const m = macros.progress[key]
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="tabular-nums">
                      {Math.round(m.consumed)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Bar percent={m.percent ?? 0} accent={accent} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </StatShell>

      {/* Budget */}
      <StatShell
        card="budget"
        href="/budget"
        icon={<Wallet className="size-4" />}
        label="Budget"
        collapsed={collapsed.budget}
      >
        {budget.expenseCents === 0 && budget.totalBudgetedCents === 0 ? (
          <p className="text-muted-foreground flex flex-1 items-center text-sm">
            No activity yet this month.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-semibold tabular-nums">
                {formatCents(budget.expenseCents, currency)}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                of {formatCents(budget.totalBudgetedCents, currency)}
              </span>
            </div>
            <Bar
              percent={budgetPercent}
              accent={overBudget ? "bg-destructive" : "bg-cat-1"}
            />
            <p className="text-muted-foreground mt-auto text-xs">
              Net{" "}
              <span
                className={cn(
                  "font-medium tabular-nums",
                  // --success, not cat-5: "money went the right way" is a semantic
                  // signal, and expressing it with a category accent here while the
                  // budget module used emerald meant one idea had two colours.
                  budget.netCents < 0 ? "text-destructive" : "text-success",
                )}
              >
                {formatCents(budget.netCents, currency)}
              </span>
            </p>
          </div>
        )}
      </StatShell>
    </div>
  )
}
