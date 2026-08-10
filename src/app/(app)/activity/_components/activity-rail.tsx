"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Flame, ListChecks, Play, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import type { GoalWithProgress } from "@/modules/goals/queries"
import type { HabitCard } from "@/modules/habits/queries"
import type { RoutineWithItems } from "@/modules/routines/queries"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

import { GoalsBlock, HANDLE_GUTTER } from "./goal-rail"

/**
 * The rail: what you're working toward, beside what you're working on.
 *
 * Three blocks — goals, routines, habits — in one sticky column. They are here rather than
 * on three separate pages because they answer the same question the task list doesn't:
 * *why* is this on the board, and what keeps putting things there.
 *
 * The blocks are deliberately unequal in how much they let you DO, and the rule is worth
 * stating because it is the same one that removed the goal card's linked-task list in T10a:
 *
 *   **the rail never offers an action the task list beside it already offers.**
 *
 * So a routine gets a Run button — running a routine CREATES tasks, which the list cannot
 * do — and a habit gets a `+1`, because a habit is not a task and has no row in that list
 * at all. Nothing else can log it.
 *
 * That last part changed in T12a and the rule did not: it got STRONGER. Until then a habit
 * was any repeating task, so its instance already sat in the list with a checkbox, and the
 * rule said "no tick here". A habit is now a quota with a log — three classes a week,
 * counted — and it generates no tasks whatever. The `+1` is not an exception to the rule,
 * it is the rule applied to a thing the list does not carry.
 *
 * The guard that follows from this, for whoever reads it next: **a habit still gets no
 * checkbox.** A quota is not done or not-done, and the moment one appears here it is either
 * duplicating the `+1` or lying about what "done" means for a rate.
 */

function BlockHeading({
  label,
  href,
  linkLabel,
}: {
  label: string
  href: string
  linkLabel: string
}) {
  return (
    <div
      className={cn("flex items-center justify-between gap-2", HANDLE_GUTTER)}
    >
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {label}
      </h2>
      <Link
        href={href}
        aria-label={linkLabel}
        className="text-muted-foreground hover:text-foreground rounded p-1"
      >
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  )
}

function RoutinesBlock({
  routines,
  onRun,
}: {
  routines: RoutineWithItems[]
  onRun: (routine: RoutineWithItems) => void
}) {
  return (
    <section aria-label="Routines" className="flex flex-col gap-2">
      <BlockHeading
        label="Routines"
        href="/activity/routines"
        linkLabel="Manage routines"
      />
      <div className={cn("flex flex-col gap-1.5", HANDLE_GUTTER)}>
        {routines.length === 0 ? (
          <p className="text-muted-foreground text-[0.6875rem]">
            None yet. A routine is a set of tasks you spin up together.
          </p>
        ) : (
          routines.map((routine) => (
            <div
              key={routine.id}
              data-testid="rail-routine"
              data-rail=""
              className="bg-card flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{routine.name}</p>
                <p className="text-muted-foreground text-[0.6875rem]">
                  {routine.items.length}{" "}
                  {routine.items.length === 1 ? "step" : "steps"}
                </p>
              </div>
              {/* The one action the task list cannot do for you. */}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Run ${routine.name}`}
                onClick={() => onRun(routine)}
              >
                <Play className="size-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function HabitsBlock({
  habits,
  pending,
  onLog,
}: {
  habits: HabitCard[]
  pending: boolean
  onLog: (card: HabitCard) => void
}) {
  return (
    <section aria-label="Habits" className="flex flex-col gap-2">
      <BlockHeading
        label="Habits"
        href="/activity/habits"
        linkLabel="Open habits"
      />
      <div className={cn("flex flex-col gap-1.5", HANDLE_GUTTER)}>
        {habits.length === 0 ? (
          <p className="text-muted-foreground text-[0.6875rem]">
            None yet. A habit is a rate you keep — three classes a week.
          </p>
        ) : (
          habits.map((card) => (
            <div
              key={card.habit.id}
              data-testid="rail-habit"
              // Excludes this from `visibleCard` in the e2e helpers. Without it a habit
              // and a task sharing a title collide and the spec hangs on a "Task actions"
              // button this row does not have. It has bitten twice.
              data-rail=""
              className="bg-card flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {card.habit.title}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Progress
                    value={card.now.percent}
                    aria-hidden
                    className="h-1 flex-1"
                  />
                  <span className="text-muted-foreground shrink-0 text-[0.6875rem] tabular-nums">
                    {card.now.done}/{card.now.target}
                  </span>
                </div>
              </div>
              {/* The one action nothing else on this screen offers. Disabled in flight:
                  there is no unique constraint behind it, so a double-click is two rows. */}
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label={`Log ${card.habit.title}`}
                onClick={() => onLog(card)}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
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
  habits,
  onRunRoutine,
  onLogHabit,
  habitPending,
}: {
  goals: GoalWithProgress[]
  selectedGoalId: string | null
  onSelect: (goalId: string | null) => void
  onOpenDetail: (goal: GoalWithProgress) => void
  onCreate: () => void
  onReorder: (ids: string[]) => void
  routines: RoutineWithItems[]
  habits: HabitCard[]
  onRunRoutine: (routine: RoutineWithItems) => void
  onLogHabit: (card: HabitCard) => void
  habitPending: boolean
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
      <RoutinesBlock routines={routines} onRun={onRunRoutine} />
      <HabitsBlock habits={habits} pending={habitPending} onLog={onLogHabit} />
    </aside>
  )
}

/**
 * Mobile: the two blocks the chip scroller has no room for, as links.
 *
 * A phone gets the goal chips and then these. Routines and habits are lists rather than a
 * single reading, and a second horizontal scroller under the first would be unusable — so
 * on a phone they stay the pages they already are, one tap away.
 */
export function RailShortcuts({
  routineCount,
  habitCount,
}: {
  routineCount: number
  habitCount: number
}) {
  return (
    <div className="flex gap-2 lg:hidden">
      <Link
        href="/activity/routines"
        className="bg-card flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm"
      >
        <ListChecks className="text-muted-foreground size-4 shrink-0" />
        <span className="font-medium">Routines</span>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {routineCount}
        </span>
      </Link>
      <Link
        href="/activity/habits"
        className="bg-card flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm"
      >
        <Flame className="text-muted-foreground size-4 shrink-0" />
        <span className="font-medium">Habits</span>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {habitCount}
        </span>
      </Link>
    </div>
  )
}
