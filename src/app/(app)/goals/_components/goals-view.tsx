"use client"

import * as React from "react"
import { Plus, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { reorderGoals } from "@/modules/goals/actions"
import type { GoalOption, GoalWithProgress } from "@/modules/goals/queries"
import type { ProposalRow } from "@/modules/companion/queries"
import { useProposal } from "@/modules/companion/use-proposal"
import { PlanProposal } from "@/components/companion/plan-proposal"
import { SortableList } from "@/components/shared/sortable-list"
import { Button } from "@/components/ui/button"

import type { EventOption } from "@/modules/calendar/queries"
import type { GoalPlanRow } from "@/modules/companion/queries"
import type { HabitRow, HabitStripCard } from "@/modules/habits/queries"
import { useWriteGuard } from "@/components/shared/use-write-guard"

import { GoalCard } from "./goal-card"
import { GoalDialog } from "./goal-dialog"
import { GoalEditorDialog } from "./goal-editor-dialog"
import { PlanGoalDialog } from "./plan-goal-dialog"
import { PlanReviewDialog } from "./plan-review-dialog"

export function GoalsView({
  goals,
  habits,
  habitRows,
  goalOptions,
  events,
  pending,
  companionEnabled,
  today,
  existingCommitments,
  plans,
  plannedGoalIds,
}: {
  goals: GoalWithProgress[]
  /**
   * Every unarchived habit, in the cheap shape.
   *
   * `getHabitStrip`, not `getHabitsView` — four fields and ~37 days of entries rather than
   * 400 days and a thirteen-column row. Safe for the same reason `/` is: everything drawn
   * here is `adherence` for the CURRENT period, which is identical under every window
   * containing today. A streak would need the wide read.
   *
   * Passed whole and filtered per goal at the point of use, rather than grouped here: the
   * editor wants one goal's practice, and the card wants a count.
   */
  habits: HabitStripCard[]
  /**
   * The same habits as full rows, for the editor's habit form.
   *
   * `getLiveHabits`, not a widened strip: `HabitDialog` reads six columns the cheap shape
   * deliberately omits, and widening it would have pushed them onto the dashboard and
   * `/activity` as well. Neither read carries the other's cost — this one loads no entries.
   */
  habitRows: HabitRow[]
  /** For the habit dialog's goal picker, inside the editor. */
  goalOptions: GoalOption[]
  /** For the goal form's target-date link. */
  events: EventOption[]
  /** Pending `goal_plan` proposals only — the page filters by kind at the query. */
  pending: ProposalRow[]
  companionEnabled: boolean
  today: string
  /** What the account already keeps in a week — the proposal's load warning reads it. */
  existingCommitments: number
  /**
   * Each goal's rows by goal id — the editor draws its Tasks section from these.
   *
   * Loaded for every goal rather than fetched when one is opened: a fetch on open would
   * put a spinner between clicking a card and seeing its tasks, on a page that already
   * holds the rows.
   */
  plans: Record<string, GoalPlanRow>
  /** Goals that have had a plan APPLIED — the ones re-planning has to warn about. */
  plannedGoalIds: string[]
}) {
  const [editorGoalId, setEditorGoalId] = React.useState<string | null>(null)
  const [goalDialogOpen, setGoalDialogOpen] = React.useState(false)
  const [goalOrder, setGoalOrder] = React.useState<string[] | null>(null)
  const [planOpen, setPlanOpen] = React.useState(false)
  // `isPending` is wanted now, for the goal list's reorder: it is true exactly while an
  // optimistic write is open, which is the window a hard navigation would throw away.
  const [writing, startTransition] = React.useTransition()
  useWriteGuard(writing)

  /**
   * No `onApplied`, and that is the whole point of the tool living here.
   *
   * On `/companion` applying a plan navigated to `/activity`, because the milestones and
   * habits it created were not on the page you were looking at. They are now: this IS the
   * goals page, and the hook's default — refresh in place — leaves you looking at the goal
   * you just planned, with its progress figure already updated.
   */
  const proposal = useProposal({ pending })
  const { busy, active, payload } = proposal

  /**
   * Closing the review is not deciding. Escape and the ✕ set this, the proposal stays
   * pending, and the note under the header opens it again. It is keyed on the proposal's
   * id rather than being a boolean, so a NEW proposal — a refinement, a fresh generation —
   * always opens: what was dismissed was the previous one.
   */
  const [dismissedId, setDismissedId] = React.useState<string | null>(null)
  const reviewOpen = active !== null && active.id !== dismissedId
  // Hidden behind the review while one is open; closed for good when the generation
  // ends (see `onPlan` below). It was "Thinking…" until then.
  const pickOpen = planOpen && !active

  // Same shape as the task list: hold the dropped order locally until the write lands, or
  // the cards snap back for the duration of the transition and the drop reads as a failure.
  function handleReorder(ids: string[]) {
    setGoalOrder(ids)
    startTransition(async () => {
      const result = await reorderGoals(ids)
      if (!result.ok) toast.error(result.error)
      setGoalOrder(null)
    })
  }

  const orderedGoals = React.useMemo(() => {
    if (!goalOrder) return goals
    const rank = new Map(goalOrder.map((id, index) => [id, index]))
    return [...goals].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
  }, [goals, goalOrder])

  // Resolve-don't-capture: derived every render, so the editor shows the goal as it is now
  // rather than as it was when it was opened. Adding a milestone revalidates and hands this
  // component a fresh array; a captured object would never see it.
  const editorGoal = editorGoalId
    ? (goals.find((goal) => goal.id === editorGoalId) ?? null)
    : null

  const goalFor = (id: string | null) => goals.find((g) => g.id === id) ?? null
  const goalTitleFor = (id: string | null) =>
    goalFor(id)?.title ?? "Unknown goal"

  /** Everything the refinement needs except the instruction. See `RefinementBox`. */
  const refineBody = active
    ? {
        kind: "goal_plan",
        goalId: active.targetId ?? "",
        proposalId: active.id,
      }
    : null

  return (
    <div className="mx-auto w-full max-w-5xl p-4 lg:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Goals
          </h1>
          <p className="text-muted-foreground text-sm">
            What you&apos;re working toward, and whether it&apos;s moving.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* The plan tool, beside the button it is the AI counterpart of. Gated on the
              same `aiReady` reading as everything else about the companion, so it simply
              is not here when the feature is off — and not before there is a goal to plan.
              It used to be a panel above the list; ADR-0021 says why it is a dialog. */}
          {companionEnabled && goals.length > 0 && (
            <Button variant="outline" onClick={() => setPlanOpen(true)}>
              <Sparkles className="text-brand-accent size-4" />
              Plan a goal
            </Button>
          )}
          <Button
            onClick={() => {
              setEditorGoalId(null)
              setGoalDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
            New goal
          </Button>
        </div>
      </header>

      {/* The way back to a proposal that was closed without a decision. */}
      {active && !reviewOpen && (
        <p className="text-muted-foreground mb-5 flex flex-wrap items-center gap-x-2 text-sm">
          A plan for {goalTitleFor(active.targetId)} is waiting.
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => setDismissedId(null)}
          >
            Review it
          </Button>
        </p>
      )}

      {orderedGoals.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          No goals yet. Add one and track it with milestones, or with a number
          you move — 12 of 30 books.
        </p>
      ) : (
        <SortableList
          items={orderedGoals}
          onReorder={handleReorder}
          labelFor={(goal) => goal.title}
          renderItem={(goal) => (
            <GoalCard
              goal={goal}
              practiceCount={
                habits.filter((habit) => habit.goalId === goal.id).length
              }
              onOpenDetail={() => setEditorGoalId(goal.id)}
            />
          )}
        />
      )}

      <GoalDialog
        events={events}
        open={goalDialogOpen}
        onOpenChange={setGoalDialogOpen}
      />
      <GoalEditorDialog
        goal={editorGoal}
        // Filtered here rather than in the dialog so the dialog takes exactly what it draws.
        habits={
          editorGoal
            ? habits.filter((habit) => habit.goalId === editorGoal.id)
            : []
        }
        habitRows={
          editorGoal
            ? habitRows.filter((row) => row.goalId === editorGoal.id)
            : []
        }
        tasks={editorGoal ? (plans[editorGoal.id]?.setupTasks ?? []) : []}
        goalOptions={goalOptions}
        events={events}
        open={editorGoal !== null}
        onOpenChange={(open) => !open && setEditorGoalId(null)}
      />

      {companionEnabled && (
        <PlanGoalDialog
          goals={goals}
          plannedGoalIds={plannedGoalIds}
          busy={busy}
          open={pickOpen}
          onOpenChange={setPlanOpen}
          onPlan={(goalId) =>
            // The pick dialog closes when the generation ends — a proposal arriving opens
            // the review, and a failure has already said so in a toast. Without this it
            // came back the moment a review closed, because `planOpen` was still true.
            void proposal
              .generate({ kind: "goal_plan", goalId })
              .then(() => setPlanOpen(false))
          }
        />
      )}

      {active && payload?.kind === "goal_plan" && (
        <PlanReviewDialog
          // Not "Proposed plan …": the renderer draws that label, and a second element
          // carrying the same words is exactly the strict-mode collision ADR-0015 warned
          // that tools sharing pages with lists would produce.
          title={`Review the plan for ${goalTitleFor(active.targetId)}`}
          open={reviewOpen}
          onOpenChange={(open) => {
            if (!open) setDismissedId(active.id)
          }}
        >
          <PlanProposal
            key={proposal.version}
            frame="dialog"
            payload={payload.payload}
            onChange={(next) =>
              proposal.setPayload({ kind: "goal_plan", payload: next })
            }
            goalTitle={goalTitleFor(active.targetId)}
            // The whole goal, not just its date: the rate check needs the numeric target
            // too, and `GoalWithProgress` already carries all four — `getGoals` selects the
            // row, so no query changed for this.
            goal={{
              targetDate: goalFor(active.targetId)?.targetDate ?? null,
              targetValue: goalFor(active.targetId)?.targetValue ?? null,
              currentValue: goalFor(active.targetId)?.currentValue ?? null,
              unit: goalFor(active.targetId)?.unit ?? null,
            }}
            today={today}
            existingCommitments={existingCommitments}
            pending={busy}
            onApply={(next) =>
              proposal.apply({ kind: "goal_plan", payload: next })
            }
            onDiscard={proposal.discard}
            refine={{
              kind: "goal_plan",
              value: proposal.instruction,
              onChange: proposal.setInstruction,
              body: refineBody,
              busy,
              onRefine: (body) => void proposal.generate(body),
            }}
          />
        </PlanReviewDialog>
      )}
    </div>
  )
}
