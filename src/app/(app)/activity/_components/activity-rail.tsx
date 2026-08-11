"use client"

import Link from "next/link"
import { ArrowRight, ListChecks, Play } from "lucide-react"

import { cn } from "@/lib/utils"
import type { GoalWithProgress } from "@/modules/goals/queries"
import type { RoutineWithItems } from "@/modules/routines/queries"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { GoalsBlock, HANDLE_GUTTER } from "./goal-rail"

/**
 * The rail: what you're working toward, beside what you're working on.
 *
 * The goals block, and one line to routines. They are here rather than on separate pages
 * because they answer the question the task list doesn't: *why* is this on the board, and
 * what keeps putting things there.
 *
 * What each part may DO is deliberately unequal, and the rule is worth stating because it
 * is the same one that removed the goal card's linked-task list in T10a:
 *
 *   **the rail never offers an action the task list beside it already offers.**
 *
 * So a goal card gets no way to tick anything — every task it owns is already a row you can
 * tick — while routines keep a Run control, because running a routine CREATES tasks, which
 * the list cannot do for you. That control is now one picker rather than a button per
 * routine; see `RoutinesLine` for what that cost.
 *
 * **Habits were the sharpest illustration of the rule and are no longer here.** Not because
 * the rule changed: a habit generates no tasks at all (ADR-0014), so logging one is
 * precisely an action the list cannot offer, and it belonged by the rule. It left because
 * this rail is `lg:flex` — so below that breakpoint the rule was being satisfied by a
 * surface that does not exist, and logging a practice, the most phone-shaped action in the
 * app, was impossible on a phone. They moved to `habit-strip.tsx`, above the task list, at
 * every width.
 *
 * The guard travelled with them and now heads that file: **a habit still gets no checkbox.**
 * A quota is not done-or-not-done, and the moment one appears it is either duplicating the
 * `+1` or lying about what "done" means for a rate.
 */

/**
 * Routines, as one line: a link to the page, and one control that runs any of them.
 *
 * It was a block of cards with a Run button each until T12d. Two things were wrong with
 * that. It grew without bound — a rail of three goals, two routines and three habits
 * measured 724px and scrolled inside itself on a 13" laptop — and running a routine is a
 * rare action given a card's worth of room every time the page loads.
 *
 * **The demotion costs something and should be read as a loss, not a tidy-up.** Running a
 * routine is the rail rule's own justifying example: it is the one thing the rail offered
 * that nothing else on this page can do. What is preserved is the ACTION, at a height that
 * no longer depends on how many routines exist — one control, one menu — which was the
 * actual constraint the old block violated. If the picker step proves annoying, the fix is
 * to make the menu better, not to put a button back on every routine.
 *
 * Rendered twice: inside the `lg:` rail, and again above the task list on a phone, where
 * the rail does not exist.
 */
export function RoutinesLine({
  routines,
  onRun,
  className,
}: {
  routines: RoutineWithItems[]
  onRun: (routine: RoutineWithItems) => void
  className?: string
}) {
  return (
    <div
      className={cn("flex items-center gap-2", HANDLE_GUTTER, className)}
      data-testid="routines-line"
    >
      <Link
        href="/activity/routines"
        className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 text-sm"
      >
        <ListChecks className="size-4 shrink-0" />
        <span className="font-medium">Routines</span>
        <span className="tabular-nums">· {routines.length}</span>
        <ArrowRight className="size-3.5 shrink-0" />
      </Link>

      {/* Hidden rather than disabled at zero: there is nothing to pick, and the empty-state
          sentence that used to explain what a routine is now lives on the page the link
          goes to, where there is room to say it properly. */}
      {routines.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <Play className="size-3.5" />
            Run…
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {routines.map((routine) => (
              <DropdownMenuItem key={routine.id} onClick={() => onRun(routine)}>
                {routine.name}
                <span className="text-muted-foreground ml-auto pl-3 text-xs tabular-nums">
                  {routine.items.length}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

export function ActivityRail({
  goals,
  selectedGoalId,
  onSelect,
  onOpenDetail,
  onCreate,
  onReorder,
  routines,
  onRunRoutine,
}: {
  goals: GoalWithProgress[]
  selectedGoalId: string | null
  onSelect: (goalId: string | null) => void
  onOpenDetail: (goal: GoalWithProgress) => void
  onCreate: () => void
  onReorder: (ids: string[]) => void
  routines: RoutineWithItems[]
  onRunRoutine: (routine: RoutineWithItems) => void
}) {
  return (
    // `top-4` and `h-fit` keep the whole rail in view while the task list scrolls past it;
    // `max-h`/`overflow-y` so a long rail scrolls itself instead of running off the screen
    // with no way back to the goals at the top.
    <aside className="hidden lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100svh-2rem)] lg:flex-col lg:gap-5 lg:overflow-y-auto lg:pb-2">
      <GoalsBlock
        goals={goals}
        selectedGoalId={selectedGoalId}
        onSelect={onSelect}
        onOpenDetail={onOpenDetail}
        onCreate={onCreate}
        onReorder={onReorder}
      />
      <RoutinesLine routines={routines} onRun={onRunRoutine} />
    </aside>
  )
}
