"use client"

import * as React from "react"
import { Plus, Repeat, Settings2, X } from "lucide-react"
import { toast } from "sonner"

import type { EventOption } from "@/modules/calendar/queries"
import type { GoalOption, GoalWithProgress } from "@/modules/goals/queries"
import type { RoutineWithItems } from "@/modules/routines/queries"
import { reorderGoals } from "@/modules/goals/actions"
import {
  clearTaskRecurrenceException,
  deleteTask,
  deleteTaskRecurrence,
  reorderTasks,
  restoreTask,
  skipTaskOccurrence,
  toggleTaskStatus,
} from "@/modules/todos/actions"
import type {
  Habit,
  List,
  TaskSeries,
  TaskWithSeries,
} from "@/modules/todos/queries"
import { bucketTasks } from "@/modules/todos/service"

import { SortableList } from "@/components/shared/sortable-list"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

import { ActivityRail, RailShortcuts } from "./activity-rail"
import { GoalChips } from "./goal-rail"
import { GoalDetailDialog } from "./goal-detail-dialog"
import { GoalDialog } from "./goal-dialog"
import { ListManager } from "./list-manager"
import { QuickAdd } from "./quick-add"
import { RecurrenceManager } from "./recurrence-manager"
import { TaskDialog } from "./task-dialog"
import { TaskItem } from "./task-item"
import { RunRoutineDialog } from "../routines/_components/run-routine-dialog"

// Just a STATUS filter. "Due today" and "Overdue" were chips until T5a; the sections below
// say the same thing without hiding everything else to do it.
type Filter = "active" | "all"

const FILTERS: { key: Filter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "all", label: "All" },
]

/** Rendered top to bottom. Someday last — it's the backlog, not the agenda. */
const SECTIONS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "someday", label: "Someday" },
] as const

export function ActivityView({
  tasks,
  lists,
  goalOptions,
  goals,
  events,
  rules,
  routines,
  habits,
  today,
  selectedGoalId: initialGoalId,
  timeZone,
}: {
  tasks: TaskWithSeries[]
  lists: List[]
  /** Every recurrence rule, including ones with no instance due right now. */
  rules: TaskSeries[]
  /** Just id and title, for the task dialog's goal picker. */
  goalOptions: GoalOption[]
  /** The full goals, with progress and momentum, for the rail. */
  goals: GoalWithProgress[]
  events: EventOption[]
  routines: RoutineWithItems[]
  /** Every repeating task with its completion history — the rail's streaks. */
  habits: Habit[]
  /** The user's own today, for the run dialog's default anchor. */
  today: string
  selectedGoalId: string | null
  timeZone: string
}) {
  const [filter, setFilter] = React.useState<Filter>("active")
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingTask, setEditingTask] = React.useState<TaskWithSeries | null>(
    null,
  )
  const [listManagerOpen, setListManagerOpen] = React.useState(false)
  const [rulesOpen, setRulesOpen] = React.useState(false)
  const [confirmSeries, setConfirmSeries] =
    React.useState<TaskWithSeries | null>(null)
  const [, startTransition] = React.useTransition()

  // Goal state: which one scopes the list, which one is open in a dialog, which is being
  // edited or created.
  const [selectedGoalId, setSelectedGoalId] = React.useState<string | null>(
    initialGoalId,
  )
  // The id, not the goal. Holding the object would freeze it at the moment it was clicked:
  // adding a milestone revalidates and hands this component a fresh `goals` array, but a
  // captured object never sees it — so the dialog would keep rendering the goal as it was
  // before the write, and the milestone you just added would not appear until you closed
  // and reopened it. Deriving from `goals` each render is what makes it live.
  const [detailGoalId, setDetailGoalId] = React.useState<string | null>(null)
  const [goalDialogOpen, setGoalDialogOpen] = React.useState(false)
  const [editingGoal, setEditingGoal] = React.useState<GoalWithProgress | null>(
    null,
  )
  const [goalOrder, setGoalOrder] = React.useState<string[] | null>(null)
  // Which routine the run dialog is for. The id, for the same reason `detailGoalId` is an
  // id: a captured routine would not see its items change underneath it.
  const [runRoutineId, setRunRoutineId] = React.useState<string | null>(null)

  /**
   * Select a goal, and put it in the URL — without a refetch.
   *
   * `router.replace` would be the obvious call and is the wrong one: every route here is
   * dynamic (`auth()` reads cookies) and Next's client router cache uses staleTime 0 for
   * dynamic routes, so it would round-trip to the server on every filter click for data
   * that did not change. `history.replaceState` updates the address bar only, which is all
   * this needs — the filter itself is client-side, and the query param exists so a search
   * result can deep link and a reload lands you back where you were.
   *
   * `replaceState` rather than `pushState` on purpose: this is a filter, not navigation.
   * Back should leave the page, not walk you out through every goal you clicked.
   */
  function selectGoal(goalId: string | null) {
    setSelectedGoalId(goalId)
    window.history.replaceState(
      null,
      "",
      goalId ? `/activity?goal=${goalId}` : "/activity",
    )
  }

  const [optimisticTasks, applyOptimistic] = React.useOptimistic<
    TaskWithSeries[],
    string
  >(tasks, (state, toggledId) =>
    state.map((task) =>
      task.id === toggledId
        ? {
            ...task,
            status:
              task.status === "open" ? ("done" as const) : ("open" as const),
          }
        : task,
    ),
  )

  function handleToggle(id: string) {
    startTransition(async () => {
      applyOptimistic(id)
      const result = await toggleTaskStatus(id)
      if (!result.ok) toast.error(result.error)
    })
  }

  function handleDelete(task: TaskWithSeries) {
    // Deleting a recurring instance stops the whole SERIES and drops its upcoming
    // occurrences — not cleanly undoable, so confirm first. One-off tasks delete with
    // an Undo. Dropping a single cycle is now "Skip this one" (handleSkip); before T5a
    // there was no such thing, because a deleted instance just regenerated on the next
    // read and stopping the series was the only way to make it go away.
    if (task.series) {
      setConfirmSeries(task)
      return
    }
    startTransition(async () => {
      const result = await deleteTask(task.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.task ?? task
      toast("Task deleted", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await restoreTask(restorable)
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  /**
   * Skip one cycle of a repeating task.
   *
   * Deliberately NOT a delete: the generator re-materializes an instance on every read,
   * so removing the row would only make it vanish until the next page load. The server
   * writes an exception row, which is also what undo removes.
   */
  function handleSkip(task: TaskWithSeries) {
    const seriesId = task.series?.id
    const occurrenceDate = task.occurrenceDate
    if (!seriesId || !occurrenceDate) return
    startTransition(async () => {
      const result = await skipTaskOccurrence(seriesId, occurrenceDate)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast("Skipped this one", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undone = await clearTaskRecurrenceException(
                seriesId,
                occurrenceDate,
              )
              if (!undone.ok) toast.error(undone.error)
            }),
        },
      })
    })
  }

  function stopRepeating(task: TaskWithSeries) {
    if (!task.series) return
    startTransition(async () => {
      const result = await deleteTaskRecurrence(task.series!.id)
      if (!result.ok) toast.error(result.error)
      else toast("Stopped repeating")
    })
  }

  // The dropped order, held locally until the server round-trip lands. Without it the
  // list snaps back to the old order for the duration of the transition — the drop looks
  // like it failed. Keyed by id so a task added meanwhile can't be lost.
  const [pendingOrder, setPendingOrder] = React.useState<string[] | null>(null)

  function handleReorder(ids: string[]) {
    setPendingOrder(ids)
    startTransition(async () => {
      const result = await reorderTasks(ids)
      if (!result.ok) toast.error(result.error)
      setPendingOrder(null)
    })
  }

  /** Apply a just-dropped order to one section, ignoring ids from other sections. */
  function applyPending(rows: TaskWithSeries[]): TaskWithSeries[] {
    if (!pendingOrder) return rows
    const rank = new Map(pendingOrder.map((id, index) => [id, index]))
    if (!rows.some((task) => rank.has(task.id))) return rows
    return [...rows].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
  }

  // Same shape as the task list: hold the dropped order locally until the write lands, or
  // the cards snap back for the duration of the transition and the drop reads as a failure.
  function handleGoalReorder(ids: string[]) {
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

  function openCreate() {
    setEditingTask(null)
    setDialogOpen(true)
  }

  function openEdit(task: TaskWithSeries) {
    setEditingTask(task)
    setDialogOpen(true)
  }

  function openCreateGoal() {
    setEditingGoal(null)
    setGoalDialogOpen(true)
  }

  function openEditGoal(goal: GoalWithProgress) {
    setDetailGoalId(null)
    setEditingGoal(goal)
    setGoalDialogOpen(true)
  }

  /**
   * The selected goal, resolved against what actually exists.
   *
   * Deleting the goal you were filtered to leaves a dangling id in state and in the URL,
   * which would otherwise render an empty list with no way to tell why. Resolving through
   * the array means a missing goal silently falls back to "all activity" — self-healing,
   * with no effect to keep in step.
   */
  const activeGoal = selectedGoalId
    ? (goals.find((goal) => goal.id === selectedGoalId) ?? null)
    : null

  // Same resolve-don't-capture rule as `activeGoal`: derived every render, so the dialog
  // shows the goal as it is now rather than as it was when it was opened.
  const runRoutine = runRoutineId
    ? (routines.find((routine) => routine.id === runRoutineId) ?? null)
    : null

  const detailGoal = detailGoalId
    ? (goals.find((goal) => goal.id === detailGoalId) ?? null)
    : null

  const scopedTasks = activeGoal
    ? optimisticTasks.filter((task) => task.goalId === activeGoal.id)
    : optimisticTasks

  // `bucketTasks` drops completed tasks, so the "All" filter keeps its own flat list —
  // a Done task has no date section it belongs in.
  const openTasks = scopedTasks.filter((task) => task.status === "open")
  const buckets = bucketTasks(openTasks, new Date(), timeZone)
  const done = scopedTasks.filter((task) => task.status === "done")
  const isEmpty =
    filter === "all" ? scopedTasks.length === 0 : openTasks.length === 0

  function emptyMessage(): string {
    if (activeGoal) {
      return filter === "active" && done.length > 0
        ? `Nothing active for ${activeGoal.title}. Switch to All to see what you've finished.`
        : `Nothing linked to ${activeGoal.title} yet. Give a task this goal to see it here.`
    }
    // "Nothing here yet" was misleading under the Active filter when the only tasks left
    // were completed ones — there IS something here, it's just filtered out. And now that
    // quick-add doesn't date a task, the empty case is worth using to say where one goes.
    return filter === "active" && done.length > 0
      ? "Nothing active. Switch to All to see what you've finished."
      : "Nothing here yet. Anything you capture above lands in Someday until you give it a date."
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 lg:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Activity
          </h1>
          <p className="text-muted-foreground text-sm">
            What needs doing, and what it&apos;s for.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Repeating tasks"
            onClick={() => setRulesOpen(true)}
          >
            <Repeat className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Manage lists"
            onClick={() => setListManagerOpen(true)}
          >
            <Settings2 className="size-4" />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            New task
          </Button>
        </div>
      </header>

      {/* The rail is a sibling of the list, not a wrapper: on mobile the chips render in
          the flow above the quick-add, and on desktop the grid puts them side by side. */}
      <div className="mb-4 flex flex-col gap-3 lg:hidden">
        <GoalChips
          goals={orderedGoals}
          selectedGoalId={activeGoal?.id ?? null}
          onSelect={selectGoal}
          onOpenDetail={(goal) => setDetailGoalId(goal.id)}
          onCreate={openCreateGoal}
        />
        <RailShortcuts
          routineCount={routines.length}
          habitCount={habits.length}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <ActivityRail
          goals={orderedGoals}
          selectedGoalId={activeGoal?.id ?? null}
          onSelect={selectGoal}
          onOpenDetail={(goal) => setDetailGoalId(goal.id)}
          onCreate={openCreateGoal}
          onReorder={handleGoalReorder}
          routines={routines}
          habits={habits}
          onRunRoutine={(routine) => setRunRoutineId(routine.id)}
        />

        <div className="min-w-0">
          <div className="mb-4">
            <QuickAdd />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-1">
            {FILTERS.map((item) => (
              <Button
                key={item.key}
                variant={filter === item.key ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </Button>
            ))}
            {/* Says what you are looking at, and undoes it. Without this the list can be
                short for two very different reasons — you're done, or you're filtered —
                and nothing on screen tells them apart. */}
            {activeGoal && (
              <Button
                variant="ghost"
                size="sm"
                // Named for what it DOES, not what it shows. Its visible text is the goal
                // title, which is also the rail card's accessible name — two buttons with
                // one name is ambiguous to a screen reader and to a test locator alike.
                aria-label={`Clear the ${activeGoal.title} filter`}
                className="ml-auto"
                onClick={() => selectGoal(null)}
              >
                <X className="size-4" />
                {activeGoal.title}
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-5">
            {isEmpty ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
                {emptyMessage()}
              </p>
            ) : (
              <>
                {SECTIONS.map((section) => {
                  const rows = applyPending(buckets[section.key])
                  if (rows.length === 0) return null
                  return (
                    <section key={section.key}>
                      <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                        {section.label}
                        {/* aria-hidden: the heading should announce "Today", not "Today3".
                            The count is a visual convenience and is fully recoverable from
                            the rows underneath it. */}
                        <span
                          aria-hidden
                          className="ml-2 font-normal tabular-nums"
                        >
                          {rows.length}
                        </span>
                      </h2>
                      <SortableList
                        items={rows}
                        onReorder={handleReorder}
                        labelFor={(task) => task.title}
                        renderItem={(task) => (
                          <TaskItem
                            task={task}
                            timeZone={timeZone}
                            onToggle={handleToggle}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                            onSkip={handleSkip}
                          />
                        )}
                      />
                    </section>
                  )
                })}

                {filter === "all" && done.length > 0 && (
                  <section>
                    <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                      Done
                      <span
                        aria-hidden
                        className="ml-2 font-normal tabular-nums"
                      >
                        {done.length}
                      </span>
                    </h2>
                    <div className="flex flex-col gap-2">
                      {done.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          timeZone={timeZone}
                          onToggle={handleToggle}
                          onEdit={openEdit}
                          onDelete={handleDelete}
                          onSkip={handleSkip}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <TaskDialog
        lists={lists}
        goals={goalOptions}
        events={events}
        task={editingTask}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <RecurrenceManager
        rules={rules}
        open={rulesOpen}
        onOpenChange={setRulesOpen}
      />
      <ListManager
        lists={lists}
        open={listManagerOpen}
        onOpenChange={setListManagerOpen}
      />
      <GoalDialog
        goal={editingGoal}
        open={goalDialogOpen}
        onOpenChange={setGoalDialogOpen}
      />
      {runRoutine && (
        <RunRoutineDialog
          routine={runRoutine}
          today={today}
          open
          onOpenChange={(open) => !open && setRunRoutineId(null)}
        />
      )}
      <GoalDetailDialog
        goal={detailGoal}
        open={detailGoal !== null}
        onOpenChange={(open) => !open && setDetailGoalId(null)}
        onEdit={openEditGoal}
      />

      <ConfirmDialog
        open={confirmSeries !== null}
        onOpenChange={(open) => !open && setConfirmSeries(null)}
        title="Stop repeating this task?"
        description={
          confirmSeries
            ? `"${confirmSeries.title}" will stop repeating and its upcoming occurrences will be removed. Occurrences you've already completed are kept.`
            : undefined
        }
        confirmLabel="Stop repeating"
        onConfirm={() => {
          if (confirmSeries) stopRepeating(confirmSeries)
        }}
      />
    </div>
  )
}
