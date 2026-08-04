"use client"

import * as React from "react"
import Link from "next/link"
import { ListTodo, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { dueStatus } from "@/lib/date"
import { cn } from "@/lib/utils"
import {
  addMilestone,
  deleteGoal,
  deleteMilestone,
  reorderGoals,
  restoreMilestone,
  toggleMilestone,
} from "@/modules/goals/actions"
import type {
  GoalRow,
  GoalWithProgress,
  MilestoneRow,
} from "@/modules/goals/queries"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { SortableList } from "@/components/shared/sortable-list"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

import { GoalDialog } from "./goal-dialog"

function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function GoalCard({
  goal,
  onEdit,
}: {
  goal: GoalWithProgress
  onEdit: (goal: GoalRow) => void
}) {
  const { timeZone } = usePreferences()
  // Reuses the to-do due-date classifier, hoisted to @/lib/date in T5a-S3 precisely so
  // goals could have it without importing across modules. A target date is a deadline
  // like any other.
  const urgency = dueStatus(goal.targetDate, new Date(), timeZone)
  // "Complete" only means something for a goal that is actually measured — an untracked
  // goal is never finished, so it can still be past its target.
  const complete = goal.progress.kind !== "none" && goal.progress.percent >= 100

  const openLinked = goal.linkedTasks.filter(
    (task) => task.status !== "done",
  ).length

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
    if (!title) return
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

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{goal.title}</h3>
          {goal.targetDate && (
            // Past its date and not finished reads as at-risk; the same destructive
            // treatment an over-target macro gets (T4-S9) and an overdue task gets.
            // A goal already at 100% is not late, it's done — saying otherwise would be
            // nagging about something you finished.
            <p
              className={cn(
                "text-xs",
                urgency === "overdue" && !complete
                  ? "text-destructive font-medium"
                  : "text-muted-foreground",
              )}
            >
              {urgency === "overdue" && !complete
                ? `Past target · ${formatDate(goal.targetDate)}`
                : urgency === "due-today" && !complete
                  ? `Target today`
                  : `Target ${formatDate(goal.targetDate)}`}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Goal actions"
              />
            }
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(goal)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {goal.notes && (
        <p className="text-muted-foreground text-sm">{goal.notes}</p>
      )}

      {/* Driven by the discriminated progress rather than by `milestones.length`, so the
          three cases are exhaustive and "nothing to measure" can't be rendered as 0%.
          The bar's width is clamped but the printed figure isn't — an overshot goal
          reads "12 of 10 lbs", the same honesty split T4-S9 settled on for macros. */}
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

      {goal.milestones.length > 0 && (
        <ul className="flex flex-col gap-1">
          {goal.milestones.map((milestone) => (
            <li key={milestone.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={milestone.done}
                // Every other checkbox in the app names what it acts on; this one didn't,
                // so it announced as a bare "checkbox" with the title only reachable as
                // separate text. Same phrasing as the task checkboxes.
                aria-label={
                  milestone.done
                    ? `Reopen ${milestone.title}`
                    : `Complete ${milestone.title}`
                }
                onCheckedChange={(checked) =>
                  run(() => toggleMilestone(milestone.id, checked === true))
                }
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  milestone.done && "text-muted-foreground line-through",
                )}
              >
                {milestone.title}
              </span>
              {milestone.dueDate && (
                // Overdue only matters while it's still outstanding — a milestone you
                // finished late is just finished.
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    !milestone.done &&
                      dueStatus(milestone.dueDate, new Date(), timeZone) ===
                        "overdue"
                      ? "text-destructive font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {formatDate(milestone.dueDate)}
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

      {/* Tasks linked to this goal (T2). Still READ-ONLY — /todos is where you act on
          them, and duplicating the checkbox here would mean two places to keep in step.
          T5a adds what was missing to make it useful at a glance: how many are left, when
          they are due, and a way through to them. */}
      {goal.linkedTasks.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-muted-foreground text-xs font-medium">
              Linked tasks
              <span className="ml-1.5 font-normal tabular-nums">
                {openLinked === 0
                  ? "all done"
                  : `${openLinked} open of ${goal.linkedTasks.length}`}
              </span>
            </p>
            <Link
              href="/todos"
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
            >
              Open →
            </Link>
          </div>
          <ul className="flex flex-col gap-1">
            {goal.linkedTasks.map((task) => {
              const taskDue = dueStatus(task.dueDate, new Date(), timeZone)
              const done = task.status === "done"
              return (
                <li key={task.id} className="flex items-center gap-2 text-sm">
                  <ListTodo className="text-muted-foreground size-3.5 shrink-0" />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      done && "text-muted-foreground line-through",
                    )}
                  >
                    {task.title}
                  </span>
                  {/* An overdue linked task is the signal worth surfacing here — it's the
                      reason a goal quietly stops moving. Finished ones say nothing. */}
                  {!done && task.dueDate && (
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        taskDue === "overdue"
                          ? "text-destructive font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      {taskDue === "overdue"
                        ? "Overdue"
                        : taskDue === "due-today"
                          ? "Today"
                          : formatDate(task.dueDate)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
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
        onConfirm={() => run(() => deleteGoal(goal.id))}
      />
    </div>
  )
}

export function GoalsView({ goals }: { goals: GoalWithProgress[] }) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingGoal, setEditingGoal] = React.useState<GoalRow | null>(null)
  const [pendingOrder, setPendingOrder] = React.useState<string[] | null>(null)
  const [, startTransition] = React.useTransition()

  // Same shape as the to-do list: hold the dropped order locally until the write lands,
  // or the cards snap back for the duration of the transition and the drop reads as a
  // failure.
  function handleReorder(ids: string[]) {
    setPendingOrder(ids)
    startTransition(async () => {
      const result = await reorderGoals(ids)
      if (!result.ok) toast.error(result.error)
      setPendingOrder(null)
    })
  }

  const ordered = React.useMemo(() => {
    if (!pendingOrder) return goals
    const rank = new Map(pendingOrder.map((id, index) => [id, index]))
    return [...goals].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
  }, [goals, pendingOrder])

  function openCreate() {
    setEditingGoal(null)
    setDialogOpen(true)
  }

  function openEdit(goal: GoalRow) {
    setEditingGoal(goal)
    setDialogOpen(true)
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Goals
          </h1>
          <p className="text-muted-foreground text-sm">
            Long-term goals, tracked by the milestones you break them into.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Add goal
        </Button>
      </header>

      {goals.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          No goals yet. Add one and track it with milestones, or with a number
          you move — 12 of 30 books.
        </p>
      ) : (
        <SortableList
          items={ordered}
          onReorder={handleReorder}
          labelFor={(goal) => goal.title}
          layout="grid"
          className="grid gap-4 sm:grid-cols-2"
          renderItem={(goal) => <GoalCard goal={goal} onEdit={openEdit} />}
        />
      )}

      <GoalDialog
        goal={editingGoal}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
