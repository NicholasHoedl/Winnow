// Read-only, so this is a server component all the way down — no "use client" anywhere
// on this route. The Ring and Heatmap primitives render on the server too.

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { accentForKey } from "@/lib/colors"
import { Heatmap, type HeatmapCell } from "@/components/charts/heatmap"
import { Ring } from "@/components/charts/ring"
import {
  completionRate,
  currentStreak,
  dateRange,
  heatmapLayout,
  longestStreak,
} from "@/modules/todos/habits"
import type { Habit } from "@/modules/todos/queries"
import { repeatLabel } from "@/modules/todos/service"

/** A wall-date formatted for a hover title. Parsed and formatted in UTC — the string has
 *  no instant behind it, so local parsing would shift it a day west of Greenwich. */
function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function HabitCard({
  habit,
  days,
  weekStartsOn,
}: {
  habit: Habit
  days: string[]
  weekStartsOn: number
}) {
  const rate = completionRate(habit.cycles)
  const streak = currentStreak(habit.cycles)
  const best = longestStreak(habit.cycles)

  const accent = accentForKey(habit.rule.id)
  const done = new Set(habit.completedDays)
  const grid = heatmapLayout(days, weekStartsOn)
  const cells: HeatmapCell[] = grid.cells.map((cell) => {
    const ticked = done.has(cell.date)
    return {
      key: cell.date,
      col: cell.col,
      row: cell.row,
      // Everything not ticked is the same flat track. Grading missed days differently
      // from days the habit never asked about would read as failure on a rest day.
      className: ticked ? accent.fill : "fill-muted",
      title: `${formatDay(cell.date)}${ticked ? " — done" : ""}`,
    }
  })

  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row">
      <div className="flex items-center gap-4 sm:flex-col sm:items-start">
        <Ring
          percent={rate.percent}
          label={`${rate.percent}%`}
          ariaLabel={`${habit.rule.title}: ${rate.completed} of ${rate.expected} completed`}
          className={accent.stroke}
        />
        <div className="sm:hidden">
          <h3 className="font-medium">{habit.rule.title}</h3>
          <p className="text-muted-foreground text-xs">
            {repeatLabel(habit.rule)}
          </p>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="hidden sm:block">
          <h3 className="font-medium">{habit.rule.title}</h3>
          <p className="text-muted-foreground text-xs">
            {repeatLabel(habit.rule)}
          </p>
        </div>
        <p className="text-muted-foreground mt-1 text-xs tabular-nums">
          Streak {streak} · best {best} ·{" "}
          {rate.expected === 0
            ? "nothing due yet"
            : `${rate.completed}/${rate.expected} done`}
        </p>
        <div className="mt-3">
          <Heatmap
            cells={cells}
            cols={grid.cols}
            ariaLabel={`${habit.rule.title}: completions over the last ${days.length} days`}
          />
        </div>
      </div>
    </div>
  )
}

export function HabitsView({
  habits,
  from,
  to,
  weekStartsOn,
}: {
  habits: Habit[]
  from: string
  to: string
  weekStartsOn: number
}) {
  const days = dateRange(from, to)

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <Link
        href="/todos"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        To-dos
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Habits</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every repeating task, over the last {days.length} days. A skipped
          cycle counts as neither a win nor a miss.
        </p>
      </div>

      {habits.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          Nothing repeats yet. Set a task to repeat and it shows up here.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {habits.map((habit) => (
            <HabitCard
              key={habit.rule.id}
              habit={habit}
              days={days}
              weekStartsOn={weekStartsOn}
            />
          ))}
        </div>
      )}
    </div>
  )
}
