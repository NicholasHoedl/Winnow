"use client"

import * as React from "react"
import { Sparkles, Target } from "lucide-react"

import type { GoalWithProgress } from "@/modules/goals/queries"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * "Plan a goal" — pick the goal, and ask.
 *
 * The tool used to be a panel pinned above the goal list, with the proposal rendered
 * beneath it and the goal's applied plan beneath THAT, so the list this page exists for was
 * never the first thing on it. T27 (ADR-0021) made it a button beside New goal that opens
 * this, and the proposal opens in a dialog of its own when it arrives. Still on `/goals`,
 * still refreshing in place — ADR-0015's arrangement, in a different frame.
 *
 * The confirmation is the same one the panel had. Its predicate is an APPLIED proposal, not
 * "the goal has milestones": the question is "replace the plan you generated?", and a goal
 * whose steps were all typed by hand has no previous plan to replace.
 */
export function PlanGoalDialog({
  goals,
  plannedGoalIds,
  busy,
  open,
  onOpenChange,
  onPlan,
}: {
  goals: GoalWithProgress[]
  /** Goals that have had a plan APPLIED — the ones re-planning has to warn about. */
  plannedGoalIds: string[]
  /** A generation is in flight. The dialog stays open and says so. */
  busy: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onPlan: (goalId: string) => void
}) {
  const [goalId, setGoalId] = React.useState(goals[0]?.id ?? "")
  const [confirm, setConfirm] = React.useState(false)

  // Resolved rather than trusted: the goal picked last time may have been deleted since.
  const selected = goals.find((goal) => goal.id === goalId) ?? goals[0] ?? null
  const selectedId = selected?.id ?? ""

  function plan() {
    if (!selectedId) return
    if (plannedGoalIds.includes(selectedId)) setConfirm(true)
    else onPlan(selectedId)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="text-brand-accent size-4" />
              Plan a goal
            </DialogTitle>
            <DialogDescription>
              Break a goal into milestones, the practice that reaches them, and
              anything you need to set up first. It proposes; you decide.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="plan-goal">Goal</FieldLabel>
            <Select
              value={selectedId}
              onValueChange={(value) => value && setGoalId(value)}
            >
              <SelectTrigger
                id="plan-goal"
                className="w-full"
                aria-label="Goal"
              >
                <SelectValue>
                  {(value) =>
                    goals.find((goal) => goal.id === value)?.title ??
                    "Pick a goal"
                  }
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
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={plan}
              disabled={busy || !selectedId}
              aria-busy={busy}
            >
              <Target className="size-4" />
              {busy ? "Thinking…" : "Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Named for what it replaces, and explicit about what it does NOT.
          "Will delete previous plan" is true of the stored proposal and false of everything
          that proposal created — and deleting a habit cascades its entries, so a dialog
          that left the question open would be one click from weeks of logged history.
          The last line is the part people get wrong: nothing is removed, so applying the
          next plan ADDS to what is here. */}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Plan this goal again?"
        description="The previous plan is replaced. Your milestones, habits and tasks are kept exactly as they are — you will review the new plan before anything is created, and whatever you apply is added alongside them."
        confirmLabel="Plan again"
        destructive={false}
        onConfirm={() => onPlan(selectedId)}
      />
    </>
  )
}
