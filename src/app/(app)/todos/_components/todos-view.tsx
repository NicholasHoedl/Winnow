"use client"

import * as React from "react"
import Link from "next/link"
import { Flame, ListChecks, Plus, Repeat, Settings2 } from "lucide-react"
import { toast } from "sonner"

import type { EventOption } from "@/modules/calendar/queries"
import type { GoalOption } from "@/modules/goals/queries"
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
import { bucketTasks } from "@/modules/todos/service"

import { SortableList } from "@/components/shared/sortable-list"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"

import { ListManager } from "./list-manager"
import { QuickAdd } from "./quick-add"
import { RecurrenceManager } from "./recurrence-manager"
import { TaskDialog } from "./task-dialog"
import { TaskItem } from "./task-item"

// Just a STATUS filter now. "Due today" and "Overdue" were chips until T5a; the sections
// below say the same thing without hiding everything else to do it.
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

export function TodosView({
  tasks,
  lists,
  goals,
  events,
  rules,
  timeZone,
}: {
  tasks: TaskWithSeries[]
  lists: List[]
  /** Every recurrence rule, including ones with no instance due right now. */
  rules: TaskSeries[]
  goals: GoalOption[]
  events: EventOption[]
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

  // `bucketTasks` drops completed tasks, so the "All" filter keeps its own flat list —
  // a Done task has no date section it belongs in.
  const openTasks = optimisticTasks.filter((task) => task.status === "open")
  const buckets = bucketTasks(openTasks, new Date(), timeZone)
  const done = optimisticTasks.filter((task) => task.status === "done")
  const isEmpty =
    filter === "all" ? optimisticTasks.length === 0 : openTasks.length === 0

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            To-dos
          </h1>
          <p className="text-muted-foreground text-sm">
            Track what needs doing.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Repeating tasks"
            onClick={() => setRulesOpen(true)}
          >
            <Repeat className="size-4" />
          </Button>
          {/* A sub-route rather than a nav entry: the bottom tab bar is full at seven,
              and `isNavActive` keeps To-dos highlighted while you're in here. */}
          <Link
            href="/todos/routines"
            aria-label="Routines"
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <ListChecks className="size-4" />
          </Link>
          <Link
            href="/todos/habits"
            aria-label="Habits"
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <Flame className="size-4" />
          </Link>
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

      <div className="mb-4">
        <QuickAdd />
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
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
      </div>

      <div className="flex flex-col gap-5">
        {isEmpty ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            {/* "Nothing here yet" was misleading under the Active filter when the only
                tasks left were completed ones — there IS something here, it's just
                filtered out. And now that quick-add doesn't date a task, the empty case
                is worth using to say where one goes. */}
            {filter === "active" && done.length > 0
              ? "Nothing active. Switch to All to see what you've finished."
              : "Nothing here yet. Anything you capture above lands in Someday until you give it a date."}
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
                    <span aria-hidden className="ml-2 font-normal tabular-nums">
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
                  <span aria-hidden className="ml-2 font-normal tabular-nums">
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

      <TaskDialog
        lists={lists}
        goals={goals}
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
