"use client"

import Link from "next/link"
import { Plus } from "lucide-react"

import type { HabitStripCard } from "@/modules/habits/queries"
import { periodPhrase } from "@/modules/habits/service"
import { useLogHabit } from "@/modules/habits/use-log-habit"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/** How many fit before the column starts pushing past the fold. */
const SHOWN = 3

/**
 * What you still owe today's practice, on the surface you see every day.
 *
 * A client component, unlike its neighbours here, because it can be acted on: a habit is
 * the one thing on this page you can finish without going anywhere. `dashboard-task-list`
 * is the precedent.
 *
 * It logs through `useLogHabit`, which is the whole reason that hook exists rather than a
 * handler on each page — this is the third surface that logs, and the first two held the
 * same twenty lines twice.
 */
export function HabitsCard({ habits }: { habits: HabitStripCard[] }) {
  const { pendingId, log } = useLogHabit()

  // Nothing at all when there are no habits, exactly as `GoalsSummary` does. Someone who
  // has never made one should not find a new empty box on their dashboard.
  if (habits.length === 0) return null

  // Unmet first, stable within each group. The card's only real failure mode is showing
  // three met habits while three unmet ones are hidden below the cut.
  //
  // The STRIP on /activity deliberately does not do this — it shows all of them, so a
  // stable manual order is worth more there (you learn where each chip is). The divergence
  // is a decision about truncation, not a drift; if the strip ever starts truncating it
  // should sort this way too.
  const short = habits.filter((h) => !h.now.met)
  const ordered = [...short, ...habits.filter((h) => h.now.met)]
  const rows = ordered.slice(0, SHOWN)
  const hidden = habits.length - rows.length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Habits</span>
          <Link
            href="/activity/habits"
            className="text-muted-foreground hover:text-foreground text-xs font-normal underline-offset-4 hover:underline"
          >
            All →
          </Link>
        </CardTitle>
        {/* The line that makes a 3-of-8 list trustworthy. `+N more` says something is
            hidden; only this says whether what's hidden still needs you. The strip on
            /activity needs no equivalent because it shows every habit there is. */}
        <p className="text-muted-foreground text-xs">
          {short.length === 0
            ? "All met"
            : `${short.length} of ${habits.length} short`}
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {rows.map((habit) => (
            <div key={habit.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{habit.title}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {habit.now.done}/{habit.now.target}{" "}
                  {periodPhrase(habit.period)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pendingId === habit.id}
                aria-label={`Log ${habit.title}`}
                onClick={() => log(habit)}
              >
                <Plus className="size-3.5" />
                Log
              </Button>
            </div>
          ))}
          {hidden > 0 && (
            <Link
              href="/activity/habits"
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
            >
              +{hidden} more →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
