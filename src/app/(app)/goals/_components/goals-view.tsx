"use client"

import * as React from "react"
import { Plus, Sparkles, Target } from "lucide-react"
import { toast } from "sonner"

import { reorderGoals } from "@/modules/goals/actions"
import type { GoalWithProgress } from "@/modules/goals/queries"
import type { ProposalRow } from "@/modules/companion/queries"
import { useProposal } from "@/modules/companion/use-proposal"
import { PlanProposal } from "@/components/companion/plan-proposal"
import { ToolPanel } from "@/components/companion/tool-panel"
import { SortableList } from "@/components/shared/sortable-list"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { GoalCard } from "./goal-card"
import { GoalDetailDialog } from "./goal-detail-dialog"
import { GoalDialog } from "./goal-dialog"

export function GoalsView({
  goals,
  pending,
  companionEnabled,
  today,
}: {
  goals: GoalWithProgress[]
  /** Pending `goal_plan` proposals only — the page filters by kind at the query. */
  pending: ProposalRow[]
  companionEnabled: boolean
  today: string
}) {
  const [detailGoalId, setDetailGoalId] = React.useState<string | null>(null)
  const [goalDialogOpen, setGoalDialogOpen] = React.useState(false)
  const [editingGoal, setEditingGoal] = React.useState<GoalWithProgress | null>(
    null,
  )
  const [goalOrder, setGoalOrder] = React.useState<string[] | null>(null)
  const [planGoalId, setPlanGoalId] = React.useState(goals[0]?.id ?? "")
  const [, startTransition] = React.useTransition()

  /**
   * No `onApplied`, and that is the whole point of moving this here.
   *
   * On `/companion` applying a plan navigated to `/activity`, because the milestones and
   * habits it created were not on the page you were looking at. They are now: this IS the
   * goals page, and the hook's default — refresh in place — leaves you looking at the goal
   * you just planned, with its progress figure already updated.
   */
  const proposal = useProposal({ pending })
  const { busy, active, payload } = proposal

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

  // Resolve-don't-capture: derived every render, so the dialog shows the goal as it is now
  // rather than as it was when it was opened. Adding a milestone revalidates and hands this
  // component a fresh array; a captured object would never see it.
  const detailGoal = detailGoalId
    ? (goals.find((goal) => goal.id === detailGoalId) ?? null)
    : null

  const goalFor = (id: string | null) => goals.find((g) => g.id === id) ?? null
  const goalTitleFor = (id: string | null) =>
    goalFor(id)?.title ?? "Unknown goal"

  function openCreateGoal() {
    setEditingGoal(null)
    setGoalDialogOpen(true)
  }

  function openEditGoal(goal: GoalWithProgress) {
    setDetailGoalId(null)
    setEditingGoal(goal)
    setGoalDialogOpen(true)
  }

  /** Everything the refinement needs except the instruction. See `RefinementBox`. */
  const refineBody = active
    ? {
        kind: "goal_plan",
        goalId: active.targetId ?? planGoalId,
        proposalId: active.id,
      }
    : null

  return (
    <div className="mx-auto w-full max-w-4xl p-4 lg:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Goals
          </h1>
          <p className="text-muted-foreground text-sm">
            What you&apos;re working toward, and whether it&apos;s moving.
          </p>
        </div>
        <Button onClick={openCreateGoal}>
          <Plus className="size-4" />
          New goal
        </Button>
      </header>

      {/* The plan tool sits with the goals it plans, which is the whole premise of T13.
          Gated on the same `aiReady` reading as everything else about the companion, so it
          simply is not here when the feature is off. */}
      {companionEnabled && goals.length > 0 && (
        <div className="mb-5">
          <ToolPanel
            icon={Sparkles}
            title="Plan a goal"
            description="Break a goal into milestones, the practice that reaches them, and anything you need to set up first. It proposes; you decide."
            refine={
              active && payload?.kind === "goal_plan"
                ? {
                    kind: "goal_plan" as const,
                    value: proposal.instruction,
                    onChange: proposal.setInstruction,
                    body: refineBody,
                    busy,
                    onRefine: (body: Record<string, unknown>) =>
                      void proposal.generate(body),
                  }
                : null
            }
          >
            <div className="flex gap-2">
              <Select
                value={planGoalId}
                onValueChange={(v) => v && setPlanGoalId(v)}
              >
                <SelectTrigger className="min-w-0 flex-1" aria-label="Goal">
                  <SelectValue>
                    {(value) => goalTitleFor(value as string)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {goals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() =>
                  void proposal.generate({
                    kind: "goal_plan",
                    goalId: planGoalId,
                  })
                }
                disabled={busy || !planGoalId}
                aria-busy={busy}
              >
                <Target className="size-4" />
                {busy ? "Thinking…" : "Plan"}
              </Button>
            </div>
          </ToolPanel>
        </div>
      )}

      {/* A proposal is a lot to read, so it gets the room — above the list rather than
          beside it, because reviewing one is a whole task and the list is not the point
          while you are doing it. */}
      {active && payload?.kind === "goal_plan" && (
        <div className="mb-5">
          <PlanProposal
            key={proposal.version}
            payload={payload.payload}
            onChange={(next) =>
              proposal.setPayload({ kind: "goal_plan", payload: next })
            }
            goalTitle={goalTitleFor(active.targetId)}
            targetDate={goalFor(active.targetId)?.targetDate ?? null}
            today={today}
            pending={busy}
            onApply={(next) =>
              proposal.apply({ kind: "goal_plan", payload: next })
            }
            onDiscard={proposal.discard}
          />
        </div>
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
              onOpenDetail={() => setDetailGoalId(goal.id)}
            />
          )}
        />
      )}

      <GoalDialog
        goal={editingGoal}
        open={goalDialogOpen}
        onOpenChange={setGoalDialogOpen}
      />
      <GoalDetailDialog
        goal={detailGoal}
        open={detailGoal !== null}
        onOpenChange={(open) => !open && setDetailGoalId(null)}
        onEdit={openEditGoal}
      />
    </div>
  )
}
