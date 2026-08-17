"use client"

import Link from "next/link"
import {
  CalendarDays,
  ChevronRight,
  ListTodo,
  Pause,
  Repeat,
  TrendingUp,
} from "lucide-react"

import { formatLongDate } from "@/lib/format"
import type { GoalWithProgress } from "@/modules/goals/queries"
import { Progress } from "@/components/ui/progress"

/** How many of a goal's tasks are still open, for the count under its name. */
function openTaskCount(goal: GoalWithProgress): number {
  return goal.linkedTasks.filter((task) => task.status !== "done").length
}

function ProgressFigure({ goal }: { goal: GoalWithProgress }) {
  if (goal.progress.kind === "none") return null
  return (
    <div className="flex items-center gap-2">
      <Progress
        value={Math.min(goal.progress.percent, 100)}
        className="h-1.5 flex-1"
      />
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {goal.progress.kind === "milestones"
          ? `${goal.progress.done}/${goal.progress.total}`
          : `${goal.progress.current}/${goal.progress.target}`}
      </span>
    </div>
  )
}

/**
 * Movement.
 *
 * The rail compressed this to a bare icon for the healthy case, because in a 280px column
 * "3 finished in the last week" cost more room than it earned. A page is not 280px wide, so
 * the moving case gets its words back — the whole reason momentum is computed is to be read,
 * and an icon that means "fine" is one nobody learns.
 */
function MomentumMark({ goal }: { goal: GoalWithProgress }) {
  if (!goal.momentum) return null
  if (!goal.momentum.stalled) {
    return (
      <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
        <TrendingUp className="size-3.5" />
        Moving
      </span>
    )
  }
  return (
    // Attention, not alarm: `--destructive` is spoken for by overdue and over-budget, which
    // are failures. A stalled goal is a nudge.
    <span className="text-brand-accent flex shrink-0 items-center gap-1 text-xs font-medium">
      <Pause className="size-3.5" />
      Stalled
    </span>
  )
}

/**
 * One goal, at full width.
 *
 * Descended from `GoalRailCard`, which this replaces — same information, no longer squeezed
 * into a sidebar. The one real change is what the card's body DOES. In the rail it selected,
 * because the task list it filtered was the next thing along; here it is a **link** to
 * `/activity?goal=<id>`, since the work is on another page now. That keeps ADR-0013's
 * insight intact — a goal is a predicate over tasks, and this is the predicate as a URL —
 * without putting a second, read-only copy of the task list on this page, which is the
 * compromise T10a deleted and which is not worth reviving.
 *
 * `data-rail` is kept even though there is no rail, and that is deliberate rather than
 * leftover. It is not a statement about layout: it is what `visibleCard` excludes when it
 * looks for a TASK row (`div.bg-card:not([data-rail])`). Two specs have already hung waiting
 * for a "Task actions" button on a goal that matched a shared title prefix. Nothing about
 * moving pages makes a goal card a task row, so the exclusion still has to hold.
 */
export function GoalCard({
  goal,
  practiceCount,
  onOpenDetail,
}: {
  goal: GoalWithProgress
  /**
   * How many habits serve this goal.
   *
   * A count rather than the habits themselves, because the card is a summary and the detail
   * dialog is where they can be read and logged. Before this existed a goal with three
   * practices behind it looked identical to one with none — on a page whose own subtitle
   * says it shows "whether it's moving", while the only thing moving it was invisible.
   */
  practiceCount: number
  onOpenDetail: () => void
}) {
  const open = openTaskCount(goal)
  return (
    <div
      // A stable hook, because the obvious one moves: the suite's `visibleCard` matches
      // `div.bg-card`, and `cn` drops `bg-card` the moment a variant sets a different
      // background.
      data-testid="goal-card"
      data-rail=""
      className="bg-card flex items-center gap-3 rounded-lg border p-3 transition-colors"
    >
      {/* Two controls rather than one wrapping the other: a button inside a link is invalid
          markup, and the drag handle already sits outside this. */}
      <Link
        href={`/activity?goal=${goal.id}`}
        aria-label={`Show tasks for ${goal.title}`}
        className="focus-visible:ring-ring min-w-0 flex-1 rounded focus-visible:ring-2 focus-visible:outline-none"
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">
            {goal.title}
          </span>
          <MomentumMark goal={goal} />
        </div>
        <div className="mt-2 max-w-md">
          <ProgressFigure goal={goal} />
        </div>
        {/* What this goal has behind it, and when it is due. `flex-wrap` because three
            facts at 393px do not fit on one line and a goal title can be long. */}
        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="flex items-center gap-1">
            <ListTodo className="size-3.5" />
            {open === 0 ? "No open tasks" : `${open} open`}
          </span>
          {practiceCount > 0 && (
            <span className="flex items-center gap-1">
              <Repeat className="size-3.5" />
              {practiceCount === 1
                ? "1 practice"
                : `${practiceCount} practices`}
            </span>
          )}
          {/* `targetDate` is already resolved: when the goal names an event, `getGoals`
              replaced the stored date with that event's day, so this reads one field either
              way. `targetEvent` only says WHY, which is worth saying — a date you cannot
              trace back to anything is the thing this link exists to fix. */}
          {goal.targetDate && (
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {formatLongDate(goal.targetDate)}
              {goal.targetEvent && (
                <span className="truncate">· {goal.targetEvent.title}</span>
              )}
            </span>
          )}
        </div>
      </Link>
      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={`Open ${goal.title}`}
        className="text-muted-foreground/50 hover:text-foreground focus-visible:ring-ring shrink-0 rounded p-1 focus-visible:ring-2 focus-visible:outline-none"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  )
}
