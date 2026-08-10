"use client"

import { ChevronRight, Pause, Plus, TrendingUp } from "lucide-react"

import { cn } from "@/lib/utils"
import type { GoalWithProgress } from "@/modules/goals/queries"
import { SortableList } from "@/components/shared/sortable-list"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

/**
 * The goal rail: what you're working toward, beside what you're working on.
 *
 * Two presentations of one thing, the same split the nav already makes — a column on
 * desktop, a horizontal scroller on a phone — because 375px cannot spare a sidebar and
 * stacking the full rail above the list would push the tasks off the fold entirely.
 *
 * Selecting a goal FILTERS the task list rather than navigating. Its detail (milestones,
 * edit, delete) is one more click, on the chevron, because the common action here is "show
 * me this goal's work" and the rare one is "change the goal".
 */

/**
 * The width of `SortableList`'s drag-handle column, so the rail's header and its
 * "All activity" control line up with the CARDS rather than with the column edge.
 *
 * A magic number, and named rather than inlined because it is: the handle is `p-1` around a
 * `size-4` icon (24px) with a `gap-1` beside it (4px). Without this the rail reads as two
 * ragged left edges 28px apart, which is exactly the kind of thing that looks like a bug
 * and gets reported as one.
 */
export const HANDLE_GUTTER = "pl-7"

type RailProps = {
  goals: GoalWithProgress[]
  selectedGoalId: string | null
  onSelect: (goalId: string | null) => void
  onOpenDetail: (goal: GoalWithProgress) => void
  onCreate: () => void
  onReorder: (ids: string[]) => void
}

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
      <span className="text-muted-foreground shrink-0 text-[0.6875rem] tabular-nums">
        {goal.progress.kind === "milestones"
          ? `${goal.progress.done}/${goal.progress.total}`
          : `${goal.progress.current}/${goal.progress.target}`}
      </span>
    </div>
  )
}

/**
 * Movement, compressed to fit.
 *
 * The goals page spelled this out in both directions ("3 finished in the last week"). In a
 * 280px rail that sentence costs more room than it earns for goals that are fine, so the
 * healthy case is a bare icon and only the exception gets words. The full sentence is still
 * in the detail dialog, which is where you go when the marker makes you ask why.
 */
function StalledMark({ goal }: { goal: GoalWithProgress }) {
  if (!goal.momentum) return null
  if (!goal.momentum.stalled) {
    return (
      <TrendingUp
        aria-label={`${goal.title} is moving`}
        className="text-muted-foreground/60 size-3.5 shrink-0"
      />
    )
  }
  return (
    // Attention, not alarm: `--destructive` is spoken for by overdue and over-budget, which
    // are failures. A stalled goal is a nudge.
    <span className="text-brand-accent flex shrink-0 items-center gap-1 text-[0.6875rem] font-medium">
      <Pause className="size-3.5" />
      Stalled
    </span>
  )
}

function GoalRailCard({
  goal,
  selected,
  onSelect,
  onOpenDetail,
}: {
  goal: GoalWithProgress
  selected: boolean
  onSelect: () => void
  onOpenDetail: () => void
}) {
  const open = openTaskCount(goal)
  return (
    <div
      // A stable hook, because the obvious one moves: the suite's `visibleCard` matches
      // `div.bg-card`, and `cn` drops `bg-card` the moment the selected variant sets a
      // different background — so a selected goal would silently stop matching.
      data-testid="goal-card"
      data-rail=""
      className={cn(
        "bg-card flex items-start gap-1 rounded-lg border p-2.5 transition-colors",
        selected && "border-primary bg-primary/[0.04]",
      )}
    >
      {/* Two buttons rather than one card-wide click containing another: a button inside a
          button is invalid markup, and the drag handle already sits outside this. */}
      {/* Labelled explicitly. Without this the accessible name is the whole card content
          — "Earn a white belt stripe Stalled 1 open" — which reads badly and, because the
          chevron beside it is "Open <title>", left two buttons whose names both contained
          the title. Naming the action fixes the announcement and the ambiguity together. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Show tasks for ${goal.title}`}
        className="focus-visible:ring-ring min-w-0 flex-1 rounded text-left focus-visible:ring-2 focus-visible:outline-none"
      >
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {goal.title}
          </span>
          <StalledMark goal={goal} />
        </div>
        <div className="mt-1.5">
          <ProgressFigure goal={goal} />
        </div>
        <p className="text-muted-foreground mt-1 text-[0.6875rem]">
          {open === 0 ? "No open tasks" : `${open} open`}
        </p>
      </button>
      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={`Open ${goal.title}`}
        className="text-muted-foreground/50 hover:text-foreground focus-visible:ring-ring shrink-0 rounded p-0.5 focus-visible:ring-2 focus-visible:outline-none"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

/**
 * Desktop: the goals block of the rail.
 *
 * Not the whole rail — `ActivityRail` owns the `<aside>` and puts routines and habits under
 * this (T10b). Kept as a block rather than a self-contained sidebar so the three can share
 * one sticky column and one scroll.
 */
export function GoalsBlock({
  goals,
  selectedGoalId,
  onSelect,
  onOpenDetail,
  onCreate,
  onReorder,
}: RailProps) {
  return (
    <section aria-label="Goals" className="flex flex-col gap-2">
      <div
        className={cn("flex items-center justify-between gap-2", HANDLE_GUTTER)}
      >
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Goals
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Add goal"
          onClick={onCreate}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className={HANDLE_GUTTER}>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selectedGoalId === null}
          className={cn(
            "focus-visible:ring-ring w-full rounded-lg border px-2.5 py-2 text-left text-sm font-medium focus-visible:ring-2 focus-visible:outline-none",
            selectedGoalId === null
              ? "border-primary bg-primary/[0.04]"
              : "bg-card",
          )}
        >
          All activity
        </button>
      </div>

      {goals.length === 0 ? (
        <p
          className={cn(
            "text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs",
            HANDLE_GUTTER,
          )}
        >
          No goals yet. Add one and track it with milestones, or with a number
          you move — 12 of 30 books.
        </p>
      ) : (
        <SortableList
          items={goals}
          onReorder={onReorder}
          labelFor={(goal) => goal.title}
          renderItem={(goal) => (
            <GoalRailCard
              goal={goal}
              selected={goal.id === selectedGoalId}
              onSelect={() => onSelect(goal.id)}
              onOpenDetail={() => onOpenDetail(goal)}
            />
          )}
        />
      )}
    </section>
  )
}

/**
 * Mobile: one horizontally scrolling row of chips.
 *
 * `overflow-x-auto` lives on this element and nothing above it is wider — the page body
 * must never scroll sideways, so the overflow is contained where it belongs.
 *
 * No drag-reordering here. dnd-kit's pointer sensor and a horizontal touch scroll want the
 * same gesture, and the scroll is the one needed every time; reorder stays on desktop.
 */
export function GoalChips({
  goals,
  selectedGoalId,
  onSelect,
  onOpenDetail,
  onCreate,
}: Omit<RailProps, "onReorder">) {
  if (goals.length === 0) {
    return (
      <div className="lg:hidden">
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus className="size-4" />
          Add a goal
        </Button>
      </div>
    )
  }

  return (
    <div className="lg:hidden">
      <div
        role="group"
        aria-label="Goals"
        className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1"
      >
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selectedGoalId === null}
          className={cn(
            "shrink-0 snap-start rounded-lg border px-3 py-2 text-sm font-medium",
            selectedGoalId === null
              ? "border-primary bg-primary/[0.04]"
              : "bg-card",
          )}
        >
          All activity
        </button>
        {goals.map((goal) => {
          const selected = goal.id === selectedGoalId
          return (
            <div
              key={goal.id}
              data-testid="goal-chip"
              data-rail=""
              className={cn(
                "flex w-40 shrink-0 snap-start items-start gap-1 rounded-lg border p-2.5",
                selected && "border-primary bg-primary/[0.04]",
                !selected && "bg-card",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(goal.id)}
                aria-pressed={selected}
                aria-label={`Show tasks for ${goal.title}`}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium">
                  {goal.title}
                </span>
                {/* Stalled belongs here as much as on desktop — it is the one reading worth
                    interrupting for, and a phone is where most glances happen. Under the
                    title rather than beside it: a w-40 chip has no horizontal room left
                    once the title has truncated. */}
                {goal.momentum?.stalled && (
                  <span className="text-brand-accent mt-0.5 flex items-center gap-1 text-[0.6875rem] font-medium">
                    <Pause className="size-3" />
                    Stalled
                  </span>
                )}
                <div className="mt-1.5">
                  <ProgressFigure goal={goal} />
                </div>
              </button>
              {/* Same chevron as desktop rather than a touch gesture nobody would find.
                  It is a small target, but it is the RARE action — the common one is the
                  whole rest of the chip. */}
              <button
                type="button"
                onClick={() => onOpenDetail(goal)}
                aria-label={`Open ${goal.title}`}
                className="text-muted-foreground/50 shrink-0 rounded p-0.5"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          )
        })}
        <button
          type="button"
          onClick={onCreate}
          aria-label="Add goal"
          className="bg-card text-muted-foreground shrink-0 snap-start rounded-lg border px-3"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}
