import Link from "next/link"
import { Pause } from "lucide-react"

import type { GoalWithProgress } from "@/modules/goals/queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function GoalsSummary({ goals }: { goals: GoalWithProgress[] }) {
  const rows = goals.slice(0, 4)
  if (rows.length === 0) return null // keep the rail clean when there are no goals

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Goals</span>
          <Link
            href="/goals"
            className="text-muted-foreground hover:text-foreground text-xs font-normal underline-offset-4 hover:underline"
          >
            All →
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {rows.map((goal) => {
            // A goal with no milestones has nothing to measure. This used to render a
            // literal "0/0" and a 2%-wide bar — a number that means nothing beside a
            // sliver of progress that doesn't exist. T0's polish item fixed the /goals
            // page and missed this one. Since T5a the discriminated `kind` carries that
            // distinction, so the two call sites can't drift apart again.
            const progress = goal.progress
            const measurable = progress.kind !== "none"
            return (
              <div key={goal.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate font-medium">
                      {goal.title}
                    </span>
                    {/* Stalled is the one thing worth saying about a goal on a surface
                        you see every day — the count and the window belong on /goals,
                        where there is room to explain them. The dashboard already runs
                        tight below 1400px, so this is an icon, not a row. */}
                    {goal.momentum?.stalled && (
                      <>
                        <Pause
                          className="text-brand-accent size-3 shrink-0"
                          aria-hidden
                        />
                        <span className="sr-only">Stalled</span>
                      </>
                    )}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {progress.kind === "milestones"
                      ? `${progress.done}/${progress.total}`
                      : progress.kind === "numeric"
                        ? `${progress.current}/${progress.target}`
                        : "Not tracked"}
                  </span>
                </div>
                {measurable && (
                  <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-cat-6 h-full rounded-full"
                      style={{
                        width: `${Math.max(2, Math.min(progress.percent, 100))}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
