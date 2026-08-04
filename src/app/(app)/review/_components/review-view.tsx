// Read-only, so this is a server component — no "use client" on this route. Week
// stepping is a link (`?week=`), not client state, which is also what makes a given week
// shareable and reloadable.

import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { addDays } from "@/lib/date"
import { formatCents } from "@/modules/budget/service"
import type { Category } from "@/modules/budget/queries"
import type { WeeklyReviewView } from "@/modules/review/queries"
import { reviewHeadline } from "@/modules/review/service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/** UTC in, UTC out — these are wall-dates with no instant behind them. */
function formatDay(date: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    ...opts,
    timeZone: "UTC",
  })
}

function formatMonth(month: string): string {
  return formatDay(`${month}-01`, { month: "long", year: "numeric" })
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-medium tabular-nums">{value}</p>
    </div>
  )
}

export function ReviewView({
  view,
  categories,
}: {
  view: WeeklyReviewView
  categories: Category[]
}) {
  const { review, weekMoney, monthMoney, month, currency, isCurrentWeek } = view
  const { weekStart, weekEnd } = review

  const categoryName = (id: string | null) =>
    (id && categories.find((c) => c.id === id)?.name) || "Uncategorised"

  // Only categories actually spent in this week, biggest first.
  const weekSpend = weekMoney.byCategory
    .filter((row) => row.spentCents > 0)
    .sort((a, b) => b.spentCents - a.spentCents)

  const range = `${formatDay(weekStart, { month: "short", day: "numeric" })} – ${formatDay(
    weekEnd,
    { month: "short", day: "numeric", year: "numeric" },
  )}`

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Weekly review
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {range} · {reviewHeadline(review)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/review?week=${addDays(weekStart, -7)}`}
            aria-label="Previous week"
            className="hover:bg-accent rounded-md border p-2"
          >
            <ArrowLeft className="size-4" />
          </Link>
          {!isCurrentWeek && (
            <Link
              href="/review"
              className="hover:bg-accent rounded-md border px-3 py-2 text-sm"
            >
              This week
            </Link>
          )}
          <Link
            href={`/review?week=${addDays(weekStart, 7)}`}
            aria-label="Next week"
            className="hover:bg-accent rounded-md border p-2"
          >
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      {review.isEmpty ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          Nothing recorded this week.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-6">
              <Stat label="Completed" value={String(review.tasks.completed)} />
              {review.tasks.busiestDay && (
                <Stat
                  label="Busiest day"
                  value={formatDay(review.tasks.busiestDay, {
                    weekday: "long",
                  })}
                />
              )}
            </div>
            {review.tasks.items.length > 0 && (
              <ul className="text-muted-foreground max-h-40 space-y-1 overflow-y-auto text-sm">
                {review.tasks.items.map((task) => (
                  <li key={task.id} className="truncate">
                    {task.title}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <Stat
                label="Days logged"
                value={`${review.macros.daysLogged}/7`}
              />
              <Stat
                label="On calorie target"
                value={
                  review.macros.daysWithTarget === 0
                    ? "—"
                    : `${review.macros.daysOnTarget}/${review.macros.daysWithTarget}`
                }
              />
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              {review.macros.daysWithTarget === 0
                ? "No macro target was in force this week."
                : "Within 10% of the day's calorie target. Each day is scored against the target that was in force then."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Money</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-6">
              <Stat
                label="Spent"
                value={formatCents(weekMoney.expenseCents, currency)}
              />
              <Stat
                label="In"
                value={formatCents(weekMoney.incomeCents, currency)}
              />
            </div>
            {weekSpend.length > 0 && (
              <ul className="max-h-32 space-y-1 overflow-y-auto text-sm">
                {weekSpend.map((row) => (
                  <li
                    key={row.categoryId ?? "none"}
                    className="flex justify-between gap-3"
                  >
                    <span className="min-w-0 truncate">
                      {categoryName(row.categoryId)}
                    </span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {formatCents(row.spentCents, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {/* Budgets are set per calendar month, so there is no honest weekly budget to
                compare a week's spend against. The month it belongs to is shown instead —
                a figure that was actually set. */}
            <div className="border-t pt-3">
              <p className="text-muted-foreground text-xs">
                {formatMonth(month)} vs budget
              </p>
              <p className="text-sm tabular-nums">
                {monthMoney.totalBudgetedCents === 0
                  ? `${formatCents(monthMoney.expenseCents, currency)} spent · nothing budgeted`
                  : `${formatCents(monthMoney.expenseCents, currency)} of ${formatCents(
                      monthMoney.totalBudgetedCents,
                      currency,
                    )}`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Goals</CardTitle>
          </CardHeader>
          <CardContent>
            {review.milestones.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No milestones ticked this week. Anything completed before this
                page existed has no timestamp, so it can&apos;t appear here.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {review.milestones.map((milestone) => (
                  <li key={milestone.id} className="truncate">
                    {milestone.title}
                    <span className="text-muted-foreground">
                      {" "}
                      · {milestone.goalTitle}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
