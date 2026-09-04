// Read-only, so this is a server component — no "use client" on this route. Week
// stepping is a link (`?week=`), not client state, which is also what makes a given week
// shareable and reloadable.

import Link from "next/link"
import { LinkPending } from "@/components/shared/link-pending"
import { ArrowLeft, ArrowRight, Flag, ListTodo } from "lucide-react"

import { addDays } from "@/lib/date"
import { formatCents } from "@/modules/budget/service"
import type { Category } from "@/modules/budget/queries"
import type { ProposalRow } from "@/modules/companion/queries"
import type { WeeklyReviewView } from "@/modules/review/queries"
import { reviewHeadline } from "@/modules/review/service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WEEK_FIGURES_ID } from "@/components/companion/summary-proposal"

import { WeekSummary } from "./week-summary"

/** UTC in, UTC out — these are wall-dates with no instant behind them. */
function formatDay(
  date: string,
  opts: Intl.DateTimeFormatOptions,
  locale: string,
): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    ...opts,
    timeZone: "UTC",
  })
}

function formatMonth(month: string, locale: string): string {
  return formatDay(`${month}-01`, { month: "long", year: "numeric" }, locale)
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
  pending,
  companionEnabled,
  locale,
}: {
  view: WeeklyReviewView
  categories: Category[]
  /** Pending `summary` proposals — the page filters by kind at the query. */
  pending: ProposalRow[]
  companionEnabled: boolean
  /**
   * A PROP, not `useDateLocale()`. This file's own first line says it: read-only, so it is a
   * server component and a hook cannot run here. The page reads the preference and passes it.
   */
  locale: string
}) {
  const { review, weekMoney, monthMoney, month, currency, isCurrentWeek } = view
  const { weekStart, weekEnd } = review

  const categoryName = (id: string | null) =>
    (id && categories.find((c) => c.id === id)?.name) || "Uncategorised"

  // Only categories actually spent in this week, biggest first.
  const weekSpend = weekMoney.byCategory
    .filter((row) => row.spentCents > 0)
    .sort((a, b) => b.spentCents - a.spentCents)

  const range = `${formatDay(weekStart, { month: "short", day: "numeric" }, locale)} – ${formatDay(
    weekEnd,
    { month: "short", day: "numeric", year: "numeric" },
    locale,
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
            {/* Same-route param change: the segment is not remounted, so `loading.tsx`
              never fires and nothing else in the app indicates this. */}
            <LinkPending className="size-4">
              <ArrowLeft className="size-4" />
            </LinkPending>
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
            <LinkPending className="size-4">
              <ArrowRight className="size-4" />
            </LinkPending>
          </Link>
        </div>
      </div>

      {review.isEmpty ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          Nothing recorded this week.
        </div>
      ) : null}

      {/* A client island in an otherwise read-only server page, above the figures it
          narrates. Hidden on an empty week as well as with the companion off: `summaryReadiness`
          would refuse it anyway, and a button whose only outcome is "there wasn't much
          there" is worse than no button. */}
      {companionEnabled && !review.isEmpty && (
        <div className="mb-4">
          <WeekSummary
            pending={pending}
            weekStart={weekStart}
            isCurrentWeek={isCurrentWeek}
          />
        </div>
      )}

      {/* The target of the summary panel's "See the figures behind this". `scroll-mt` so the
          first card lands with a little air above it rather than flush to the viewport
          edge; there is no sticky chrome to clear, so that margin is the whole of it. */}
      <div
        id={WEEK_FIGURES_ID}
        className="grid scroll-mt-4 gap-4 sm:grid-cols-2"
      >
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
                  value={formatDay(
                    review.tasks.busiestDay,
                    {
                      weekday: "long",
                    },
                    locale,
                  )}
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
              {/* Against the days that have HAPPENED, not against a constant seven. On a
                  Wednesday "3/7" counts four days as missed when three have not arrived —
                  reported from real use, and the figure the summary narrates, so the two
                  have to agree.

                  A week not yet begun has nothing elapsed to measure against, and falls back
                  to the whole week: "0/7" for a week ahead is honest, "0/0" is not. */}
              <Stat
                label="Days logged"
                value={`${review.macros.daysLogged}/${
                  review.progress.elapsed || review.progress.total
                }`}
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
              {/* Second sentence removed. It read "Each day is scored against the target
                  that was in force then" — a description of historical target versioning,
                  which is a fact about how this was built rather than about your week. The
                  first sentence says what the figure means, which is the whole job. */}
              {review.macros.daysWithTarget === 0
                ? "No macro target was in force this week."
                : "Within 10% of the day's calorie target."}
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
                {formatMonth(month, locale)} vs budget
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
            {review.milestones.length === 0 && review.goalTasks.length === 0 ? (
              /* The second sentence is gone, and it was the clearest example in the app of
                 the UI explaining its own construction to the person who built it: it said
                 that work completed before this page existed carries no timestamp, which is
                 a note about `milestones.completed_at` being forward-only (T7d). True, still
                 recorded in that column's own comment, and not something an empty state
                 should be telling anyone. */
              <p className="text-muted-foreground text-sm">
                Nothing finished toward a goal this week.
              </p>
            ) : (
              /* Milestones first, then the tasks that fed a goal. Both are "goal
                 movement", and showing only the first made this card read as dead most
                 weeks — a milestone gets ticked every few weeks at best, while the work
                 underneath it happens daily. The tasks here also appear in the tasks
                 count above; that is the point, not a double-count. */
              <ul className="space-y-1 text-sm">
                {review.milestones.map((milestone) => (
                  <li key={milestone.id} className="flex items-center gap-2">
                    <Flag className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="min-w-0 truncate">
                      {milestone.title}
                      <span className="text-muted-foreground">
                        {" "}
                        · {milestone.goalTitle}
                      </span>
                    </span>
                  </li>
                ))}
                {review.goalTasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-2">
                    <ListTodo className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="min-w-0 truncate">
                      {task.title}
                      <span className="text-muted-foreground">
                        {" "}
                        · {task.goalTitle}
                      </span>
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
