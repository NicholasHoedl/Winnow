"use client"

import * as React from "react"
import { Pause, Pencil, Trash2, TrendingUp } from "lucide-react"
import { toast } from "sonner"

import { dueStatus } from "@/lib/date"
import { cn } from "@/lib/utils"
import {
  addMilestone,
  deleteGoal,
  deleteMilestone,
  restoreMilestone,
  toggleMilestone,
} from "@/modules/goals/actions"
import type { GoalWithProgress, MilestoneRow } from "@/modules/goals/queries"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

import { formatGoalDate, windowLabel } from "./goal-format"

/**
 * Everything about one goal that isn't its tasks.
 *
 * This is the old `GoalCard` body lifted out of the goals page, with **one block
 * deliberately dropped: the linked-task list.** On the goals page that list was the only
 * way to see a goal's work, and T5a made exactly one row actionable as a compromise —
 * telling you a goal had stalled and then sending you to another page to act was the shape
 * of advice nobody takes. On `/activity` the compromise is unnecessary: selecting this goal
 * filters the task list beside it to precisely these tasks, all of them checkable, sortable
 * and editable. A read-only copy in here would be a second place to keep in step.
 *
 * A dialog rather than a side sheet because the app has no Sheet primitive and goal editing
 * is already a dialog — one overlay pattern, not two.
 */
export function GoalDetailDialog({
  goal,
  open,
  onOpenChange,
  onEdit,
}: {
  goal: GoalWithProgress | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (goal: GoalWithProgress) => void
}) {
  const { timeZone } = usePreferences()
  const [newMilestone, setNewMilestone] = React.useState("")
  const [newDue, setNewDue] = React.useState("")
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok && result.error) toast.error(result.error)
    })
  }

  function addOne() {
    const title = newMilestone.trim()
    if (!title || !goal) return
    setNewMilestone("")
    setNewDue("")
    run(() => addMilestone(goal.id, { title, dueDate: newDue }))
  }

  // Deleting a single milestone is cleanly reversible, so undo rather than confirm.
  function removeMilestone(milestone: MilestoneRow) {
    startTransition(async () => {
      const result = await deleteMilestone(milestone.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.milestone ?? milestone
      toast("Milestone deleted", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await restoreMilestone(restorable)
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  if (!goal) return null

  const urgency = dueStatus(goal.targetDate, new Date(), timeZone)
  // "Complete" only means something for a goal that is actually measured — an untracked
  // goal is never finished, so it can still be past its target.
  const complete = goal.progress.kind !== "none" && goal.progress.percent >= 100

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{goal.title}</DialogTitle>
            <DialogDescription>
              {goal.targetDate
                ? urgency === "overdue" && !complete
                  ? `Past target · ${formatGoalDate(goal.targetDate)}`
                  : urgency === "due-today" && !complete
                    ? "Target today"
                    : `Target ${formatGoalDate(goal.targetDate)}`
                : "No target date."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {goal.notes && (
              <p className="text-muted-foreground text-sm">{goal.notes}</p>
            )}

            {/* Driven by the discriminated progress rather than by `milestones.length`, so
                the three cases are exhaustive and "nothing to measure" can't be rendered as
                0%. The bar's width is clamped but the printed figure isn't — an overshot
                goal reads "12 of 10 lbs". */}
            {goal.progress.kind === "none" ? (
              <p className="text-muted-foreground text-xs">
                No milestones or target yet.
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <Progress
                  value={Math.min(goal.progress.percent, 100)}
                  className="flex-1"
                />
                <span className="text-muted-foreground text-xs tabular-nums">
                  {goal.progress.kind === "milestones"
                    ? `${goal.progress.done}/${goal.progress.total}`
                    : `${goal.progress.current} / ${goal.progress.target}${
                        goal.progress.unit ? ` ${goal.progress.unit}` : ""
                      }`}
                </span>
              </div>
            )}

            {/* Movement, which is a different question from the bar above it. A goal
                three-quarters done that you abandoned last month and one three-quarters
                done that you touched yesterday report the same percentage, and that gap is
                the whole reason this exists. */}
            {goal.momentum && (
              <div
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  // Attention, not alarm. `--destructive` is spoken for by overdue and
                  // over-budget, which are failures; a stalled goal is a nudge.
                  goal.momentum.stalled
                    ? "text-brand-accent"
                    : "text-muted-foreground",
                )}
              >
                {goal.momentum.stalled ? (
                  <Pause className="size-3.5 shrink-0" />
                ) : (
                  <TrendingUp className="size-3.5 shrink-0" />
                )}
                <span>
                  {goal.momentum.stalled
                    ? `Nothing finished in ${windowLabel(goal.momentum.windowDays)}`
                    : `${goal.momentum.moved} finished in ${windowLabel(goal.momentum.windowDays)}`}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Milestones
              </h3>
              {goal.milestones.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  None yet. Break the goal into steps you can tick off.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {goal.milestones.map((milestone) => (
                    <li
                      key={milestone.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={milestone.done}
                        // Every other checkbox in the app names what it acts on; a bare
                        // "checkbox" leaves the title reachable only as separate text.
                        aria-label={
                          milestone.done
                            ? `Reopen ${milestone.title}`
                            : `Complete ${milestone.title}`
                        }
                        onCheckedChange={(checked) =>
                          run(() =>
                            toggleMilestone(milestone.id, checked === true),
                          )
                        }
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          milestone.done &&
                            "text-muted-foreground line-through",
                        )}
                      >
                        {milestone.title}
                      </span>
                      {milestone.dueDate && (
                        // Overdue only matters while it's still outstanding — a milestone
                        // you finished late is just finished.
                        <span
                          className={cn(
                            "shrink-0 text-xs",
                            !milestone.done &&
                              dueStatus(
                                milestone.dueDate,
                                new Date(),
                                timeZone,
                              ) === "overdue"
                              ? "text-destructive font-medium"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatGoalDate(milestone.dueDate)}
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Delete ${milestone.title}`}
                        onClick={() => removeMilestone(milestone)}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex gap-2">
                <Input
                  value={newMilestone}
                  onChange={(e) => setNewMilestone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addOne()
                    }
                  }}
                  placeholder="Add a milestone"
                  className="h-8"
                />
                <Input
                  type="date"
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  aria-label="Milestone due date"
                  className="h-8 w-36"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addOne}
                  disabled={pending}
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="flex justify-between gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onEdit(goal)}
              >
                <Pencil className="size-4" />
                Edit goal
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this goal?"
        description={
          goal.milestones.length > 0
            ? `"${goal.title}" and its ${goal.milestones.length} milestone${
                goal.milestones.length === 1 ? "" : "s"
              } will be permanently deleted.`
            : `"${goal.title}" will be permanently deleted.`
        }
        confirmLabel="Delete goal"
        onConfirm={() => {
          // Closes the detail dialog too — leaving it open over a goal that no longer
          // exists would render a stale title until the refresh landed.
          onOpenChange(false)
          run(() => deleteGoal(goal.id))
        }}
      />
    </>
  )
}
