"use client"

import Link from "next/link"
import { Pause, Plus } from "lucide-react"

import type { GoalProgress } from "@/modules/goals/service"
import type { HabitStripCard } from "@/modules/habits/queries"
import { periodPhrase } from "@/modules/habits/service"
import { useLogHabit } from "@/modules/habits/use-log-habit"
import { Button } from "@/components/ui/button"

import { DashboardCard } from "./dashboard-card"

import { groupPracticeByGoal } from "../_lib/goal-practice"

/**
 * A goal, reduced to the four fields this card draws.
 *
 * Deliberately NOT `GoalWithProgress`. This is a client component — it has to be, because a
 * habit can be logged from here — so everything it receives is serialised into the RSC
 * payload and shipped to the browser. `GoalWithProgress` carries `milestones[]`,
 * `linkedTasks[]` and `linkedTaskTotal`, none of which appear below.
 *
 * Same reasoning that produced `HabitStripCard`: a surface showing four fields should not be
 * handed a thirteen-column row. The page narrows on the way in.
 */
export type GoalPracticeRow = {
  id: string
  title: string
  progress: GoalProgress
  /** `momentum?.stalled`, already resolved — the card never needs the window or the count. */
  stalled: boolean
}

function GoalHeading({ goal }: { goal: GoalPracticeRow }) {
  // Aliased to a const before the discriminant check, which is what lets TypeScript narrow
  // the union for `progress.percent` below — the same pattern the card this replaces used.
  // Checking `goal.progress.kind` inline compiles the check but narrows nothing.
  const progress = goal.progress
  const measurable = progress.kind !== "none"
  return (
    <>
      {/* The title and its count share this div, and that is load-bearing beyond taste:
          `goals-progress.spec.ts` locates a goal with `.filter({hasText}).last()`, which
          resolves to the innermost div holding the title, and then asserts the count is in
          it. Splitting them moves that locator and fails a test about something else. */}
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate font-medium">{goal.title}</span>
          {/* Stalled is the one thing worth saying about a goal on a surface you see every
              day — the count and the window belong in the goal's detail on /goals, where
              there is room to explain them. The dashboard already runs tight below 1400px,
              so this is an icon. */}
          {goal.stalled && (
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
    </>
  )
}

function HabitRow({
  habit,
  pending,
  onLog,
}: {
  habit: HabitStripCard
  pending: boolean
  onLog: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{habit.title}</p>
        {/* Wording pinned by the e2e — "0/3 this week", "0/1 today". `habits/service.ts`
            carries the same warning at `periodPhrase`. */}
        <p className="text-muted-foreground text-xs tabular-nums">
          {habit.now.done}/{habit.now.target} {periodPhrase(habit.period)}
        </p>
      </div>
      {/* A habit gets no checkbox, here or anywhere (ADR-0013's amendment). A quota is not
          done-or-not-done, and the moment a tick appears it is either duplicating this
          button or lying about what "done" means for a rate. */}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label={`Log ${habit.title}`}
        onClick={onLog}
      >
        <Plus className="size-3.5" />
        Log
      </Button>
    </div>
  )
}

/**
 * What you are working toward, and the practice that gets you there.
 *
 * One card rather than the two this replaces. `habits.goal_id` has existed since T12a and
 * the dashboard never showed it, so "why am I doing this" and "what am I doing about it"
 * sat in different columns — the goal in the right one, the thing you act on in the left.
 *
 * **Nothing is truncated.** The card it replaces capped habits at three with a `+N more`,
 * and the goals card capped at four SILENTLY, which is worse — goals five and up simply were
 * not there and nothing said so. Both caps are gone, which also retires the unmet-first
 * re-sort the habits card used: that existed only to make a cut safe, and with nothing
 * hidden it would just scatter a goal's practice.
 *
 * A client component, unlike most of this page, because it can be acted on: a habit is the
 * one thing here you can finish without going anywhere. It logs through `useLogHabit`, the
 * same hook `/activity`'s strip and the habits page use.
 */
export function GoalsPracticeCard({
  goals,
  habits,
  collapsed,
}: {
  goals: GoalPracticeRow[]
  habits: HabitStripCard[]
  collapsed: boolean
}) {
  const { pendingId, log } = useLogHabit()

  // Nothing at all when there is nothing to show, exactly as both cards this replaces did.
  // Someone who has made neither a goal nor a habit should not find an empty box on their
  // dashboard — and `loading.tsx` deliberately reserves no space for this card because of
  // it, so a placeholder here would be a jump rather than a courtesy.
  if (goals.length === 0 && habits.length === 0) return null

  const groups = groupPracticeByGoal(goals, habits)
  const short = habits.filter((habit) => !habit.now.met)

  return (
    <DashboardCard
      card="goals"
      title="Goals & practice"
      collapsed={collapsed}
      actions={
        /* Two links, because the card has two subjects and each has a page. The `All →`
           these replaced pointed at `/activity`, which has been the wrong answer for goals
           since T13 gave `/goals` a page again. */
        <>
          <Link
            href="/goals"
            className="text-muted-foreground hover:text-foreground text-xs font-normal underline-offset-4 hover:underline"
          >
            Goals →
          </Link>
          <Link
            href="/activity/habits"
            className="text-muted-foreground hover:text-foreground text-xs font-normal underline-offset-4 hover:underline"
          >
            Habits →
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Moved into the body from the header, which the shell now owns. It belongs with
            the list anyway: it answers "am I behind?" about the rows directly beneath it,
            and folding the card should take it away along with them. */}
        {habits.length > 0 && (
          <p className="text-muted-foreground -mt-1 text-xs">
            {short.length === 0
              ? "All met"
              : `${short.length} of ${habits.length} short`}
          </p>
        )}
        {groups.map((group) => (
          <div key={group.goal?.id ?? "unattached"}>
            {group.goal ? (
              <GoalHeading goal={group.goal} />
            ) : (
              /* Named rather than left as a nameless trailing list. These are practices
                   you keep for their own sake, or ones whose goal was deleted — `goal_id`
                   is `ON DELETE SET NULL` so giving up a target keeps the running — and
                   both deserve to be told apart from a goal at a glance. */
              <p className="text-muted-foreground text-xs font-medium">
                Not tied to a goal
              </p>
            )}
            {group.habits.length > 0 && (
              <div className="mt-2 flex flex-col gap-2 pl-3">
                {group.habits.map((habit) => (
                  <HabitRow
                    key={habit.id}
                    habit={habit}
                    pending={pendingId === habit.id}
                    onLog={() => log(habit)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </DashboardCard>
  )
}
