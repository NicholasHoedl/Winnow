"use client"

import * as React from "react"
import {
  AlertTriangle,
  Flag,
  ListTodo,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  addMilestone,
  deleteMilestone,
  restoreMilestone,
  updateMilestone,
} from "@/modules/goals/actions"
import type { GoalOption } from "@/modules/goals/queries"
import type { GoalPlanRow } from "@/modules/companion/queries"
import { planWarnings, type PlanWarning } from "@/modules/companion/service"
// Editing a habit opens `HabitDialog`, which owns `updateHabit` itself — a rate box
// here would be a second, narrower way to change the same row, and the period and unit
// are exactly the fields that need the real form.
import { deleteHabit } from "@/modules/habits/actions"
import type { HabitRow } from "@/modules/habits/queries"
import {
  createTask,
  deleteTask,
  restoreTask,
  updateTask,
} from "@/modules/todos/actions"
import { HabitDialog } from "@/components/habits/habit-dialog"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

import { EditableDate, EditableTitle } from "./plan-fields"

/**
 * The plan a goal actually has, editable in place.
 *
 * **Its counterpart is `PlanProposal`, and the difference is what everything here turns
 * on.** That panel reviews a payload the model produced: nothing is real yet, a checkbox
 * means "do not create this", and unticking costs nothing. This one edits the rows that
 * payload became. A row here is a milestone somebody is working toward, a habit with weeks
 * of entries behind it, a task on a list — so there is no checkbox anywhere in it, and
 * removing one is a delete with a trash icon on it. The two panels are deliberately not
 * one component with a mode flag: a control that means "skip" in one state and "destroy"
 * in the other is a misclick waiting to be reported.
 *
 * **Why real rows rather than the stored payload.** Applying a plan is a one-way fan-out
 * of creates — `addMilestone`, `createHabit`, `createTask` — and nothing records which row
 * came from which payload entry. Re-opening the saved payload and cascading edits from it
 * would need that correspondence: matching by title breaks the first time a milestone is
 * renamed in the goal dialog, and a stored mapping buys the cascade at the price of two
 * sources of truth that drift the moment anything is edited elsewhere. Editing the rows
 * themselves has no correspondence to keep, because every row carries its own id.
 *
 * **Every edit writes immediately**, the way the goal dialog does, so there is no Apply and
 * no half-saved state to reason about. The warnings recompute from what is on screen, so a
 * date you fix stops being a warning as you type.
 */
export function PlanEditor({
  plan,
  goalId,
  goalTitle,
  goal,
  goalOptions,
  habitRows,
  today,
  existingCommitments,
  onReplan,
}: {
  plan: GoalPlanRow
  goalId: string
  goalTitle: string
  /** What the plan is judged against — the same shape `PlanProposal` takes. */
  goal: {
    targetDate: string | null
    targetValue: number | null
    currentValue: number | null
    unit: string | null
  }
  /** For the habit dialog's goal picker. */
  goalOptions: GoalOption[]
  /** Full habit rows, so editing one opens the real form rather than a rate box. */
  habitRows: HabitRow[]
  today: string
  existingCommitments: number
  /** Opens the re-plan confirmation. The generation itself belongs to the caller. */
  onReplan: () => void
}) {
  const [pending, startTransition] = React.useTransition()
  const [newMilestone, setNewMilestone] = React.useState("")
  const [newTask, setNewTask] = React.useState("")
  const [habitDialogOpen, setHabitDialogOpen] = React.useState(false)
  const [editingHabit, setEditingHabit] = React.useState<HabitRow | null>(null)
  const [habitToDelete, setHabitToDelete] = React.useState<
    GoalPlanRow["habits"][number] | null
  >(null)

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok && result.error) toast.error(result.error)
    })
  }

  /**
   * The plan in the shape `planWarnings` reads.
   *
   * A straight projection — the ids are dropped and nothing else changes, because the real
   * rows already carry every field the checks look at. `dueDate` is nullable here and is
   * not in a generated payload, which is exactly the case `planWarnings` was taught to
   * skip rather than compare as a string.
   */
  const warnings = React.useMemo(
    () =>
      planWarnings(
        {
          milestones: plan.milestones.map((m) => ({
            title: m.title,
            dueDate: m.dueDate,
          })),
          habits: plan.habits.map((h) => ({
            title: h.title,
            period: h.period,
            targetCount: h.targetCount,
            targetAmount: h.targetAmount,
            unit: h.unit,
          })),
          setupTasks: plan.setupTasks.map((t) => ({
            title: t.title,
            dueDate: t.dueDate,
          })),
        } as Parameters<typeof planWarnings>[0],
        goal,
        today,
        // The load already counts THIS goal's habits, so they are not added twice — the
        // caller measures every live habit, and these are among them.
        existingCommitments,
      ),
    [plan, goal, today, existingCommitments],
  )
  const warningFor = (on: "milestone" | "setupTask", index: number) =>
    warnings.find((w) => w.on === on && w.index === index)
  const planLevel = warnings.filter((w) => w.on === "plan")

  function addOne() {
    const title = newMilestone.trim()
    if (!title) return
    setNewMilestone("")
    // Dated after the last step, matching the proposal panel: appending to a plan means
    // "and then this". `addMilestone` requires a date string, so an empty plan anchors on
    // today rather than sending null.
    const last = plan.milestones.at(-1)?.dueDate
    run(() => addMilestone(goalId, { title, dueDate: last ?? today }))
  }

  function addTask() {
    const title = newTask.trim()
    if (!title) return
    setNewTask("")
    // Undated, landing in Someday — the same shape "make a task from this milestone"
    // produces in the goal dialog, and for the same reason: a setup task dated by the plan
    // is work dated by when it must be finished rather than when you mean to do it.
    run(() => createTask({ title, goalId }))
  }

  /** Deleting a milestone or a task is cleanly reversible, so undo rather than confirm. */
  function removeMilestone(row: GoalPlanRow["milestones"][number]) {
    startTransition(async () => {
      const result = await deleteMilestone(row.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.milestone
      toast("Milestone deleted", {
        action: restorable
          ? {
              label: "Undo",
              onClick: () =>
                startTransition(async () => {
                  const back = await restoreMilestone(restorable)
                  if (!back.ok) toast.error(back.error)
                }),
            }
          : undefined,
      })
    })
  }

  function removeTask(row: GoalPlanRow["setupTasks"][number]) {
    startTransition(async () => {
      const result = await deleteTask(row.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.task
      toast("Task deleted", {
        action: restorable
          ? {
              label: "Undo",
              onClick: () =>
                startTransition(async () => {
                  const back = await restoreTask(restorable)
                  if (!back.ok) toast.error(back.error)
                }),
            }
          : undefined,
      })
    })
  }

  const counts = `${plan.milestones.length} milestone${
    plan.milestones.length === 1 ? "" : "s"
  }, ${plan.habits.length} habit${plan.habits.length === 1 ? "" : "s"} and ${
    plan.setupTasks.length
  } task${plan.setupTasks.length === 1 ? "" : "s"}`

  return (
    <>
      <div className="bg-card flex flex-col overflow-hidden rounded-xl border lg:min-h-0">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            {/* Not "Proposed plan". Nothing here is a proposal any more — these rows
                exist, and the heading is the first thing that has to say so. */}
            <p className="text-muted-foreground text-xs font-medium">
              Your plan
            </p>
            <h2 className="truncate font-medium">{goalTitle}</h2>
          </div>
        </div>

        <div className="max-h-[55svh] overflow-y-auto p-4 lg:max-h-none lg:min-h-0 lg:flex-1">
          {planLevel.map((warning) => (
            <p
              key={warning.kind}
              className="text-brand-accent mb-4 flex items-start gap-1.5 text-xs"
            >
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {warning.message}
            </p>
          ))}

          <ol className="border-border ml-1.5 flex flex-col gap-5 border-l-2 pl-5">
            {plan.milestones.map((milestone, index) => {
              const warning = warningFor("milestone", index)
              return (
                <MilestoneRow
                  key={milestone.id}
                  milestone={milestone}
                  index={index}
                  warning={warning}
                  pending={pending}
                  onEdit={(patch) =>
                    run(() =>
                      updateMilestone(milestone.id, {
                        title: patch.title ?? milestone.title,
                        dueDate: patch.dueDate ?? milestone.dueDate ?? "",
                      }),
                    )
                  }
                  onRemove={() => removeMilestone(milestone)}
                />
              )
            })}
          </ol>

          <div className="mt-2 ml-[26px] flex gap-2">
            <input
              value={newMilestone}
              onChange={(event) => setNewMilestone(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addOne()
                }
              }}
              placeholder="Add a milestone"
              aria-label="Add a milestone"
              className="hover:bg-muted focus:bg-muted focus:ring-ring min-w-0 flex-1 rounded px-1 text-sm outline-none focus:ring-1"
            />
          </div>

          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                The practice
              </h3>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => {
                  setEditingHabit(null)
                  setHabitDialogOpen(true)
                }}
              >
                <Plus className="size-3.5" />
                Add a practice
              </Button>
            </div>
            {plan.habits.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing yet. A practice is something you repeat — three sessions
                a week — rather than a step you finish.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {plan.habits.map((habit) => (
                  <li
                    key={habit.id}
                    className="flex items-baseline gap-2 text-sm"
                  >
                    <Repeat className="text-muted-foreground size-3.5 shrink-0 self-center" />
                    <span className="min-w-0 flex-1 truncate">
                      {habit.title}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {habit.targetAmount !== null && habit.unit
                        ? `${habit.targetAmount} ${habit.unit} a ${habit.period}`
                        : `${habit.targetCount}× a ${habit.period}`}
                    </span>
                    <button
                      type="button"
                      aria-label={`Edit ${habit.title}`}
                      onClick={() => {
                        setEditingHabit(
                          habitRows.find((row) => row.id === habit.id) ?? null,
                        )
                        setHabitDialogOpen(true)
                      }}
                      className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline-offset-4 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${habit.title}`}
                      onClick={() => setHabitToDelete(habit)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6">
            <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              Before you start
            </h3>
            {plan.setupTasks.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {plan.setupTasks.map((task, index) => (
                  <li
                    key={task.id}
                    className="flex items-baseline gap-2 text-sm"
                  >
                    <ListTodo className="text-muted-foreground size-3.5 shrink-0 self-center" />
                    <EditableTitle
                      value={task.title}
                      disabled={task.done}
                      label={`Task ${index + 1} title`}
                      className={cn(task.done && "line-through")}
                      onChange={(title) =>
                        run(() =>
                          updateTask(task.id, {
                            title,
                            dueDate: task.dueDate ?? "",
                            goalId,
                          }),
                        )
                      }
                    />
                    <EditableDate
                      value={task.dueDate ?? ""}
                      disabled={task.done}
                      warning={warningFor("setupTask", index)}
                      label={`Task ${index + 1} date`}
                      onChange={(dueDate) =>
                        run(() =>
                          updateTask(task.id, {
                            title: task.title,
                            dueDate,
                            goalId,
                          }),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Delete ${task.title}`}
                      onClick={() => removeTask(task)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex gap-2">
              <input
                value={newTask}
                onChange={(event) => setNewTask(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    addTask()
                  }
                }}
                placeholder="Add a task"
                aria-label="Add a task"
                className="hover:bg-muted focus:bg-muted focus:ring-ring min-w-0 flex-1 rounded px-1 text-sm outline-none focus:ring-1"
              />
            </div>
          </section>
        </div>

        {/* No Apply. Every edit above has already been written — the counter states what
            the goal HOLDS rather than what a button is about to create, which is the
            clearest signal that this panel is not the proposal one. */}
        <div className="bg-muted/40 flex items-center justify-between gap-3 border-t p-3">
          <p className="text-muted-foreground text-xs">
            This goal has {counts}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onReplan}
            disabled={pending}
          >
            Re-plan with AI
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={habitToDelete !== null}
        onOpenChange={(next) => !next && setHabitToDelete(null)}
        title="Delete this habit?"
        description={
          habitToDelete
            ? `"${habitToDelete.title}" and everything logged against it will be permanently deleted. Archive from the habits page keeps the history instead.`
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
        defaultGoalId={goalId}
        open={habitDialogOpen}
        onOpenChange={setHabitDialogOpen}
      />
    </>
  )
}

/** One step on the spine. Extracted only to keep the editor's body readable. */
function MilestoneRow({
  milestone,
  index,
  warning,
  pending,
  onEdit,
  onRemove,
}: {
  milestone: GoalPlanRow["milestones"][number]
  index: number
  warning?: PlanWarning
  pending: boolean
  onEdit: (patch: { title?: string; dueDate?: string }) => void
  onRemove: () => void
}) {
  return (
    <li className="relative">
      <span
        className={cn(
          "border-card absolute top-1.5 -left-[27px] size-3 rounded-full border-2",
          // Done is its own colour and outranks a warning: a step you have already
          // reached cannot be badly dated any more.
          milestone.done
            ? "bg-muted-foreground/40"
            : warning && warning.kind !== "tight"
              ? "bg-destructive"
              : warning
                ? "bg-brand-accent"
                : "bg-primary",
        )}
      />
      <div className="flex items-baseline gap-2 text-sm">
        <Flag className="text-muted-foreground size-3.5 shrink-0 self-center" />
        {/* A completed milestone is shown, struck through, and not editable. Hiding it
            would make the timeline lie about what has happened; letting it be re-dated
            would let you move a date that has already passed in fact. */}
        <EditableTitle
          value={milestone.title}
          disabled={milestone.done}
          label={`Milestone ${index + 1} title`}
          className="font-medium"
          onChange={(title) => onEdit({ title })}
        />
        <EditableDate
          value={milestone.dueDate ?? ""}
          disabled={milestone.done}
          warning={warning}
          label={`Milestone ${index + 1} date`}
          onChange={(dueDate) => onEdit({ dueDate })}
        />
        <button
          type="button"
          aria-label={`Delete ${milestone.title}`}
          onClick={onRemove}
          disabled={pending}
          className="text-muted-foreground hover:text-destructive shrink-0"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {warning && !milestone.done && (
        <p
          className={cn(
            "mt-1 ml-7 text-xs",
            warning.kind === "tight" ? "text-brand-accent" : "text-destructive",
          )}
        >
          {warning.message}
        </p>
      )}
    </li>
  )
}
