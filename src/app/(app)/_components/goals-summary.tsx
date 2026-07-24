import Link from "next/link"

import type { GoalWithProgress } from "@/modules/goals/queries"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

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
          {rows.map((goal) => (
            <div key={goal.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">{goal.title}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {goal.progress.done}/{goal.progress.total}
                </span>
              </div>
              <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-cat-6 h-full rounded-full"
                  style={{ width: `${Math.max(2, goal.progress.percent)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
