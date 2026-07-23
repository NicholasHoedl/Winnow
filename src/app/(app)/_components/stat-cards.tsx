import Link from "next/link"
import { ArrowUpRight, ListTodo, Utensils, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatCents, type MonthSummary } from "@/modules/budget/service"
import type { MacroProgressSet } from "@/modules/meals/service"

type TasksLite = {
  overdueCount: number
  dueTodayCount: number
}

const MACROS = [
  { key: "calories", label: "Cal", accent: "bg-cat-3" },
  { key: "protein", label: "Protein", accent: "bg-cat-1" },
  { key: "carbs", label: "Carbs", accent: "bg-cat-5" },
  { key: "fat", label: "Fat", accent: "bg-cat-4" },
] as const

function StatShell({
  href,
  icon,
  label,
  children,
}: {
  href: string
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="group bg-card hover:ring-foreground/20 flex flex-col gap-3 rounded-xl p-4 shadow-sm ring-1 ring-foreground/10 transition-[box-shadow,--tw-ring-color]"
    >
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
          {icon}
          {label}
        </div>
        <ArrowUpRight className="text-muted-foreground/50 group-hover:text-foreground size-4 transition-colors" />
      </div>
      {children}
    </Link>
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
  tasks,
  macros,
  budget,
  currency,
}: {
  tasks: TasksLite
  macros: { progress: MacroProgressSet }
  budget: MonthSummary
  currency: string
}) {
  const nothingLogged = MACROS.every(
    ({ key }) => macros.progress[key].consumed === 0,
  )
  const budgetPercent =
    budget.totalBudgetedCents > 0
      ? Math.round((budget.expenseCents / budget.totalBudgetedCents) * 100)
      : 0
  const overBudget = budget.totalBudgetedCents > 0 && budget.expenseCents > budget.totalBudgetedCents

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {/* Tasks */}
      <StatShell href="/todos" icon={<ListTodo className="size-4" />} label="Tasks">
        <div className="flex items-end gap-5">
          <div>
            <div
              className={cn(
                "text-3xl font-semibold tabular-nums",
                tasks.overdueCount > 0 && "text-destructive",
              )}
            >
              {tasks.overdueCount}
            </div>
            <div className="text-muted-foreground text-xs">Overdue</div>
          </div>
          <div>
            <div className="text-3xl font-semibold tabular-nums">
              {tasks.dueTodayCount}
            </div>
            <div className="text-muted-foreground text-xs">Due today</div>
          </div>
        </div>
        <p className="text-muted-foreground mt-auto text-xs">
          {tasks.overdueCount + tasks.dueTodayCount === 0
            ? "All clear."
            : "Tap to review."}
        </p>
      </StatShell>

      {/* Macros */}
      <StatShell href="/meals" icon={<Utensils className="size-4" />} label="Macros">
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
                    <span className="tabular-nums">{Math.round(m.consumed)}</span>
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
      <StatShell href="/budget" icon={<Wallet className="size-4" />} label="Budget">
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
                  budget.netCents < 0 ? "text-destructive" : "text-cat-5",
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
