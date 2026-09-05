"use client"

import * as React from "react"
import {
  Archive,
  ListPlus,
  MoreVertical,
  Pause,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import { dueStatus } from "@/lib/date"
import { cn } from "@/lib/utils"
import {
  addMilestone,
  deleteGoal,
  deleteMilestone,
  restoreMilestone,
  toggleMilestone,
  updateMilestone,
} from "@/modules/goals/actions"
import type {
  GoalOption,
  GoalWithProgress,
  MilestoneRow,
} from "@/modules/goals/queries"
import type { PracticeOnDelete } from "@/modules/goals/validation"
import { archiveHabit, deleteHabit } from "@/modules/habits/actions"
import type { HabitRow, HabitStripCard } from "@/modules/habits/queries"
import { periodPhrase } from "@/modules/habits/service"
import { useLogHabit } from "@/modules/habits/use-log-habit"
import { createTask } from "@/modules/todos/actions"
import {
  useDateLocale,
  usePreferences,
} from "@/components/preferences/preferences-provider"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { HabitDialog } from "@/components/habits/habit-dialog"
import { LogHabitButton } from "@/components/habits/log-habit-button"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { QuotaMeter } from "@/components/ui/quota-meter"

import { DeleteGoalDialog } from "./delete-goal-dialog"
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
 *
 * **Every row in here has to survive a 320px phone.** The dialog is `overflow-y-auto`, and
 * the CSS overflow spec promotes the paired `visible` axis to `auto` — so a row too wide
 * for it gets a horizontal scrollbar rather than being clipped, silently. That is why the
 * two-field rows stack below `sm` and why every flex child that holds text carries
 * `min-w-0`. `e2e/mobile-layout.spec.ts` measures this dialog at 320, 375 and 393.
 */
export function GoalDetailDialog({
  goal,
  habits,
  habitRows,
  goalOptions,
  open,
  onOpenChange,
  onEdit,
}: {
  goal: GoalWithProgress | null
  /**
   * The habits serving THIS goal, already filtered by the caller.
   *
   * Note what this is not: a task list. ADR-0013 dropped that deliberately and it stays
   * dropped — two lists of the same rows drift and only one can be acted on. A habit is a
   * different thing. It has no checkbox, it appears nowhere else on this page, and logging
   * one is the only way to move a goal whose work is a practice rather than a checklist.
   */
  habits: HabitStripCard[]
  /**
   * The same habits as full rows, for the edit dialog.
   *
   * Two shapes rather than one, and the split is deliberate. `HabitStripCard` is five
   * fields and a current-period reading — enough to DRAW a practice, and missing every
   * column `HabitDialog` needs to EDIT one. Widening the strip would have pushed those
   * columns onto the dashboard and `/activity` too, which is the cost its own note refuses.
   * `getLiveHabits` loads them separately and carries no entries at all.
   */
  habitRows: HabitRow[]
  /** For the habit dialog's goal picker. */
  goalOptions: GoalOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (goal: GoalWithProgress) => void
}) {
  const { timeZone } = usePreferences()
  const locale = useDateLocale()
  // The same hook the dashboard card, `/activity`'s strip and the habits page use. It
  // returns `pendingId` rather than a boolean, so logging one habit does not disable the
  // rest — a shared flag disabled every habit at once when this was first written.
  const { pendingId, log } = useLogHabit()
  const [newMilestone, setNewMilestone] = React.useState("")
  const [newDue, setNewDue] = React.useState("")
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  // Which milestone is open for editing, and its draft. One id rather than a per-row flag:
  // two rows in edit mode at once is a state nothing on screen can explain.
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editTitle, setEditTitle] = React.useState("")
  const [editDue, setEditDue] = React.useState("")

  const [habitDialogOpen, setHabitDialogOpen] = React.useState(false)
  const [editingHabit, setEditingHabit] = React.useState<HabitRow | null>(null)
  const [habitToDelete, setHabitToDelete] = React.useState<HabitRow | null>(
    null,
  )

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

  function startEdit(milestone: MilestoneRow) {
    setEditingId(milestone.id)
    setEditTitle(milestone.title)
    setEditDue(milestone.dueDate ?? "")
  }

  function cancelEdit() {
    setEditingId(null)
    setEditTitle("")
    setEditDue("")
  }

  /**
   * Save the open edit.
   *
   * An empty title cancels rather than writing — `milestoneInputSchema` would reject it, and
   * a toast saying "Title is required" for a field the user simply cleared and clicked away
   * from is an error report about nothing. Deleting is the Trash button, deliberately.
   */
  function saveEdit(milestone: MilestoneRow) {
    const title = editTitle.trim()
    const due = editDue
    cancelEdit()
    if (!title) return
    if (title === milestone.title && due === (milestone.dueDate ?? "")) return
    run(() => updateMilestone(milestone.id, { title, dueDate: due }))
  }

  /**
   * Turn a milestone into a task on this goal.
   *
   * Undated on purpose. A milestone's `dueDate` is the date the STEP is meant to be reached;
   * copying it onto the task would date the work by when it must be finished, which is how
   * you end up with a list of things all overdue on the same morning. It lands in Someday
   * and you give it a day when you plan to do it — the same shape quick-add produces.
   */
  function makeTask(milestone: MilestoneRow) {
    if (!goal) return
    startTransition(async () => {
      const result = await createTask({
        title: milestone.title,
        goalId: goal.id,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Added “${milestone.title}”`, {
        description: "In Someday, linked to this goal.",
      })
    })
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

  function openHabitDialog(habit: HabitRow | null) {
    setEditingHabit(habit)
    setHabitDialogOpen(true)
  }

  function handleArchiveHabit(habit: HabitRow) {
    startTransition(async () => {
      const result = await archiveHabit(habit.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast(`${habit.title} archived`, {
        description: "Its history is kept, and it can be restored from Habits.",
      })
    })
  }

  if (!goal) return null

  const urgency = dueStatus(goal.targetDate, new Date(), timeZone)
  // "Complete" only means something for a goal that is actually measured — an untracked
  // goal is never finished, so it can still be past its target.
  const complete = goal.progress.kind !== "none" && goal.progress.percent >= 100
  const rowById = new Map(habitRows.map((row) => [row.id, row]))

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{goal.title}</DialogTitle>
            <DialogDescription>
              {goal.targetDate
                ? urgency === "overdue" && !complete
                  ? `Past target · ${formatGoalDate(goal.targetDate, locale)}`
                  : urgency === "due-today" && !complete
                    ? "Target today"
                    : `Target ${formatGoalDate(goal.targetDate, locale)}`
                : "No target date."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* The whole note, newlines intact. `whitespace-pre-wrap` because the field
                is a textarea and HTML otherwise collapses every line break the user typed
                into a single space; `break-words` because a pasted URL has nothing to wrap
                at and would push the dialog wide. */}
            {goal.notes && (
              <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">
                {goal.notes}
              </p>
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
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
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
                <span className="min-w-0">
                  {goal.momentum.stalled
                    ? `Nothing finished in ${windowLabel(goal.momentum.windowDays)}`
                    : `${goal.momentum.moved} finished in ${windowLabel(goal.momentum.windowDays)}`}
                </span>
              </div>
            )}

            {/* The practice that serves this goal.
                `habits.goal_id` has existed since T12a and this page never showed it, so a
                goal could read "Moving" here with nothing on screen saying what was moving
                it. Above the milestones because a habit is the thing you do repeatedly and a
                milestone is the thing that then happens. */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Practice
                </h3>
                {/* Named for what it adds. A bare "Add" collides with the milestone
                    row's own Add button, which leaves both reachable only by position. */}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => openHabitDialog(null)}
                >
                  <Plus className="size-3.5" />
                  Add a practice
                </Button>
              </div>
              {habits.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  None yet. A practice is something you repeat — three classes a
                  week — rather than a step you finish.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {habits.map((habit) => {
                    const row = rowById.get(habit.id)
                    return (
                      <li key={habit.id} className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          {/* Two lines, not one. This is the DETAIL view for the
                              goal — the place you come to read what its practice
                              actually is — and `truncate` cut a real habit title
                              off mid-word. `line-clamp-2` still bounds the row so
                              the meter below it stays put. */}
                          <p className="line-clamp-2 text-sm break-words">
                            {habit.title}
                          </p>
                          <QuotaMeter
                            className="mt-1"
                            name={habit.title}
                            done={habit.now.done}
                            target={habit.now.target}
                            unit={habit.now.unit}
                            measured={habit.now.measured}
                            caption={periodPhrase(habit.period)}
                          />
                        </div>
                        {/* Loggable in place. Sending you to `/activity/habits` to tick off
                            the thing this goal is made of is exactly the round trip T5a's
                            read-only task list was criticised for. */}
                        <LogHabitButton
                          title={habit.title}
                          unit={habit.now.unit}
                          pending={pendingId === habit.id}
                          size="sm"
                          onLog={(amount) => log(habit, amount)}
                        />
                        {/* One menu rather than three icon buttons. Edit, archive and
                            delete would cost ~96px on a row that already carries a title, a
                            meter and a log button, and this dialog has to fit a 320px
                            phone — see the note at the top of this file. */}
                        {row && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="shrink-0"
                                  aria-label={`${habit.title} actions`}
                                />
                              }
                            >
                              <MoreVertical className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => openHabitDialog(row)}
                              >
                                <Pencil className="size-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleArchiveHabit(row)}
                              >
                                <Archive className="size-4" />
                                Archive
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setHabitToDelete(row)}
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

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
                  {goal.milestones.map((milestone) =>
                    editingId === milestone.id ? (
                      // Stacked below `sm`: a title field, a date field and two buttons do
                      // not fit a phone on one line, and the dialog would grow a horizontal
                      // scrollbar rather than clip them.
                      <li
                        key={milestone.id}
                        className="flex flex-col gap-2 py-1 sm:flex-row sm:items-center"
                      >
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              saveEdit(milestone)
                            }
                            if (e.key === "Escape") {
                              e.preventDefault()
                              // Escape reaches the Dialog and closes the whole thing
                              // otherwise — cancelling an edit would throw you out of the
                              // goal. `preventDefault` alone does not stop that; the
                              // listener is on an ancestor, so the event has to be stopped
                              // from reaching it.
                              e.stopPropagation()
                              cancelEdit()
                            }
                          }}
                          aria-label={`Edit ${milestone.title}`}
                          autoFocus
                          className="h-8 min-w-0 flex-1"
                        />
                        <div className="flex gap-2">
                          <Input
                            type="date"
                            value={editDue}
                            onChange={(e) => setEditDue(e.target.value)}
                            aria-label={`Due date for ${milestone.title}`}
                            className="h-8 min-w-0 flex-1 sm:w-36 sm:flex-none"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => saveEdit(milestone)}
                            disabled={pending}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="shrink-0"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      </li>
                    ) : (
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
                        {/* The title IS the edit affordance. A fourth icon button on this
                            row would not fit a phone, and a milestone with a typo in it
                            could previously only be deleted and retyped — which loses its
                            position and whatever `completed_at` it had earned. */}
                        <button
                          type="button"
                          aria-label={`Edit ${milestone.title}`}
                          onClick={() => startEdit(milestone)}
                          className={cn(
                            "hover:text-foreground line-clamp-2 min-w-0 flex-1 text-left break-words",
                            milestone.done &&
                              "text-muted-foreground line-through",
                          )}
                        >
                          {milestone.title}
                        </button>
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
                            {formatGoalDate(milestone.dueDate, locale)}
                          </span>
                        )}
                        {/* Make it a task, one way, with nothing stored pointing back.
                            A milestone is "the next thing"; a task is a thing you do. There
                            was no bridge between them, so breaking a milestone into work meant
                            retyping its title on another page.
                            **The new task links to the GOAL, not to the milestone**, and that
                            is the whole design. T12c removed `milestoneIndex` from the
                            companion's payload precisely because a stored position into the
                            milestones array silently repointed every task after any milestone
                            that was deleted. Create-and-forget gets the workflow without
                            reviving that class of bug — and a goal is where tasks have always
                            attached in the data model anyway. */}
                        {!milestone.done && (
                          <button
                            type="button"
                            aria-label={`Make a task from ${milestone.title}`}
                            onClick={() => makeTask(milestone)}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <ListPlus className="size-3.5" />
                          </button>
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
                    ),
                  )}
                </ul>
              )}

              {/* Stacked below `sm`, for the reason at the top of this file: a text field, a
                  date field and a button are together wider than a phone, and `min-w-0` is
                  what lets them shrink at all — a flex child defaults to `min-width: auto`,
                  which floors it at its intrinsic width. */}
              <div className="flex flex-col gap-2 sm:flex-row">
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
                  className="h-8 min-w-0 flex-1"
                />
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={newDue}
                    onChange={(e) => setNewDue(e.target.value)}
                    aria-label="Milestone due date"
                    className="h-8 min-w-0 flex-1 sm:w-36 sm:flex-none"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={addOne}
                    disabled={pending}
                  >
                    Add
                  </Button>
                </div>
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

      <DeleteGoalDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={goal.title}
        milestoneCount={goal.milestones.length}
        habitCount={habits.length}
        onConfirm={(practice: PracticeOnDelete) => {
          // Closes the detail dialog too — leaving it open over a goal that no longer
          // exists would render a stale title until the refresh landed.
          onOpenChange(false)
          run(() => deleteGoal(goal.id, practice))
        }}
      />

      <ConfirmDialog
        open={habitToDelete !== null}
        onOpenChange={(next) => !next && setHabitToDelete(null)}
        title="Delete this habit?"
        description={
          habitToDelete
            ? `"${habitToDelete.title}" and everything logged against it will be permanently deleted. Archive keeps the history instead.`
            : undefined
        }
        confirmLabel="Delete habit"
        onConfirm={() => {
          if (habitToDelete) run(() => deleteHabit(habitToDelete.id))
        }}
      />

      <HabitDialog
        habit={editingHabit}
        goals={goalOptions}
        defaultGoalId={goal.id}
        open={habitDialogOpen}
        onOpenChange={setHabitDialogOpen}
      />
    </>
  )
}
