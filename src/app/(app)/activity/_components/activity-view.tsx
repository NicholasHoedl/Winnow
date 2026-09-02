"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRight,
  Filter,
  MoreVertical,
  Plus,
  Repeat,
  Search,
  Settings2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import type { EventOption } from "@/modules/calendar/queries"
import type { GoalOption, GoalWithProgress } from "@/modules/goals/queries"
import type { HabitStripCard } from "@/modules/habits/queries"
import type { RoutineWithItems } from "@/modules/routines/queries"
import { useLogHabit } from "@/modules/habits/use-log-habit"
import {
  clearTaskRecurrenceException,
  deleteTask,
  deleteTaskRecurrence,
  reorderTasks,
  restoreTask,
  skipTaskOccurrence,
  toggleTaskStatus,
} from "@/modules/todos/actions"
import type { List, TaskSeries, TaskWithSeries } from "@/modules/todos/queries"
import {
  bucketTasks,
  searchTasks,
  sortByCompletion,
} from "@/modules/todos/service"

import { SortableList } from "@/components/shared/sortable-list"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWriteGuard } from "@/components/shared/use-write-guard"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { RoutinesLine } from "./routines-line"
import { HabitStrip } from "./habit-strip"
import { ListManager } from "./list-manager"
import { QuickAdd } from "./quick-add"
import { RecurrenceManager } from "./recurrence-manager"
import { TaskDialog } from "./task-dialog"
import { TaskItem } from "./task-item"
import { RunRoutineDialog } from "../routines/_components/run-routine-dialog"

// Just a STATUS filter. "Due today" and "Overdue" were chips until T5a; the sections below
// say the same thing without hiding everything else to do it.
type Filter = "active" | "all" | "completed"

const FILTERS: { key: Filter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "all", label: "All" },
  { key: "completed", label: "Completed" },
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
  /** Every live habit with its current-period count — the strip above the list. */
  habits: HabitStripCard[]
  /** The user's own today, for the run dialog's default anchor. */
  today: string
  selectedGoalId: string | null
  timeZone: string
}) {
  // "all", not "active". The search box narrows what the FILTER has already chosen rather
  // than reaching past it, so an Active default would have silently hidden every match you
  // had already finished — and a search that omits the thing you searched for is worse than
  // no search at all. Defaulting to All is what makes the narrower rule safe.
  const [filter, setFilter] = React.useState<Filter>("all")
  const [query, setQuery] = React.useState("")
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingTask, setEditingTask] = React.useState<TaskWithSeries | null>(
    null,
  )
  const [listManagerOpen, setListManagerOpen] = React.useState(false)
  const [rulesOpen, setRulesOpen] = React.useState(false)
  const [confirmSeries, setConfirmSeries] =
    React.useState<TaskWithSeries | null>(null)
  // `isPending` is wanted now, for the task list's reorder: it is true exactly while an
  // optimistic write is open, which is the window a hard navigation would throw away.
  const [writing, startTransition] = React.useTransition()
  useWriteGuard(writing)
  // The strip's own transition lives inside the hook, so ticking a task cannot grey out a
  // Log button and logging cannot grey out the list. Shared with `/activity/habits` and the
  // dashboard card — the handler used to exist here and there, verbatim.
  const { pendingId: habitPendingId, log: logHabit } = useLogHabit()

  /**
   * Which goal scopes the list — and that is now ALL this page knows about goals.
   *
   * Creating, editing, reordering and reading a goal moved to `/goals` in T13. What stays is
   * the filter, because a goal is a predicate over tasks (ADR-0013) and this is the page
   * with the tasks on it. The `?goal=` contract is unchanged, so search results and
   * bookmarks that deep-link here still work.
   */
  const [selectedGoalId, setSelectedGoalId] = React.useState<string | null>(
    initialGoalId,
  )
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

  function openCreate() {
    setEditingTask(null)
    setDialogOpen(true)
  }

  function openEdit(task: TaskWithSeries) {
    setEditingTask(task)
    setDialogOpen(true)
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

  const scopedTasks = activeGoal
    ? optimisticTasks.filter((task) => task.goalId === activeGoal.id)
    : optimisticTasks

  // Applied BEFORE the open/done split, which is exactly what makes the box narrow whatever
  // the filter has already chosen instead of reaching past it.
  const matched = searchTasks(scopedTasks, query)

  // `bucketTasks` drops completed tasks, so the "All" filter keeps its own flat list —
  // a Done task has no date section it belongs in.
  const openTasks = matched.filter((task) => task.status === "open")
  const buckets = bucketTasks(openTasks, new Date(), timeZone)
  // Newest first: `getTasks` orders by sort_order then due date, which says nothing useful
  // about finished work and scattered the thing you just ticked through the list.
  const done = sortByCompletion(
    matched.filter((task) => task.status === "done"),
  )
  const isEmpty =
    filter === "active"
      ? openTasks.length === 0
      : filter === "completed"
        ? done.length === 0
        : matched.length === 0

  function emptyMessage(): string {
    // A search that matched nothing is its own case. The messages below explain where a
    // captured task lands, which is not what you want to read when you typed a word and got
    // nothing back — and under Active it would tell you to switch to All, which is wrong
    // advice when the reason is the query rather than the filter.
    if (query.trim()) return "No tasks match that search."
    if (filter === "completed") {
      return activeGoal
        ? `Nothing completed for ${activeGoal.title} yet.`
        : "Nothing completed yet. Tick something off and it will show up here."
    }
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
    // `max-w-5xl`, the List tier, not the `max-w-7xl` Board tier it used to be. HANDOFF's
    // width scale reserves Board for "genuinely multi-column", and this page stopped being
    // that in T13 — the comment further down already says "one column at every width now".
    // The width simply did not follow: task rows stretched ~945px at 1280px, long enough
    // that the eye loses the line, and the habit strip's "open" arrow sat stranded ~570px
    // to the right of the last chip. Its siblings — Habits, Routines, Goals — are all List.
    <div className="mx-auto w-full max-w-5xl p-4 lg:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Activity
          </h1>
        </div>
        {/* Secondary actions behind one named menu, rather than a row of bare icons.
            On a phone there is no hover, so an icon is the only thing you get and
            "repeating tasks" is not guessable from a loop glyph — while on any width the
            row of them was chrome standing between the heading and the list. One trigger
            costs less room AND says what everything inside it does. Same shape as the
            per-row "Task actions" menu this page already uses. */}
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Activity actions"
                />
              }
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setRulesOpen(true)}>
                <Repeat className="size-4" />
                Repeating tasks
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setListManagerOpen(true)}>
                <Settings2 className="size-4" />
                Manage lists
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            New task
          </Button>
        </div>
      </header>

      {/* One column at every width now. The `lg:grid-cols-[17.5rem_minmax(0,1fr)]` that was
          here spent 280px on the goal rail; T13 moved goals to `/goals` and the task list
          gets the width back. */}
      <div className="mb-4">
        <RoutinesLine
          routines={routines}
          onRun={(routine) => setRunRoutineId(routine.id)}
        />
      </div>

      <div>
        <div className="min-w-0">
          <div className="mb-4">
            <QuickAdd />
          </div>

          {/* Between the quick-add and the filters, at every width. On a phone that puts
              the quick-add row between this scroller and the goal chips above it, which is
              what makes two horizontal scrollers on one screen readable. */}
          <div className="mb-4">
            <HabitStrip
              habits={habits}
              pendingId={habitPendingId}
              onLog={logHabit}
            />
          </div>

          {/* Its own row rather than squeezed into the toolbar below. That row already wraps
              hard on a phone — three status buttons, the goal menu, and a clear control —
              and an input wide enough to type a task title into would push it to a third
              line. Full width here costs one row and fights nothing.

              Not the ⌘K palette, which searches every module server-side. This filters a
              list the page already holds, so there is no round trip and no debounce. */}
          <div className="relative mb-3">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks"
              // The placeholder is not a label — it disappears the moment you type, and it
              // is the only thing naming this control.
              aria-label="Search tasks"
              className="h-9 pl-8"
            />
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

            {/* The goal filter, which used to be the rail: clicking a goal card scoped the
                list. A menu rather than a row of chips because this is now the only thing
                on the page that mentions goals, and a control that grows with the number of
                goals is what cost the rail its place.

                Hidden entirely at zero goals rather than disabled — an empty menu explains
                nothing, and the place to make a goal is `/goals`. */}
            {goals.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant={activeGoal ? "secondary" : "ghost"}
                      size="sm"
                      aria-label="Filter by goal"
                    />
                  }
                >
                  <Filter className="size-3.5" />
                  Goal
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => selectGoal(null)}>
                    All activity
                  </DropdownMenuItem>
                  {goals.map((goal) => (
                    <DropdownMenuItem
                      key={goal.id}
                      onClick={() => selectGoal(goal.id)}
                    >
                      {goal.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* Says what you are looking at, and undoes it. Without this the list can be
                short for two very different reasons — you're done, or you're filtered —
                and nothing on screen tells them apart. */}
            {activeGoal && (
              <div className="ml-auto flex items-center gap-1">
                {/* The way back to the goal itself, which the rail used to be. Without it
                    this page names a goal and offers no way to reach it. */}
                <Link
                  href="/goals"
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
                >
                  Goals
                  <ArrowRight className="size-3" />
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  // Named for what it DOES, not what it shows. Its visible text is the goal
                  // title, and naming the action keeps this unambiguous to a screen reader
                  // and to a test locator alike.
                  aria-label={`Clear the ${activeGoal.title} filter`}
                  onClick={() => selectGoal(null)}
                >
                  <X className="size-4" />
                  {activeGoal.title}
                </Button>
              </div>
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
                  // Completed shows finished work and nothing else; the date sections are
                  // built from open tasks only.
                  if (filter === "completed") return null
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

                {filter !== "active" && done.length > 0 && (
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
      {runRoutine && (
        <RunRoutineDialog
          routine={runRoutine}
          today={today}
          open
          onOpenChange={(open) => !open && setRunRoutineId(null)}
        />
      )}
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
