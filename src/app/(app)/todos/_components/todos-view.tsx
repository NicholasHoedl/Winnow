"use client"

import * as React from "react"
import { Plus, Settings2 } from "lucide-react"
import { toast } from "sonner"

import {
  deleteTask,
  deleteTaskRecurrence,
  restoreTask,
  toggleTaskStatus,
} from "@/modules/todos/actions"
import type { List, TaskWithSeries } from "@/modules/todos/queries"
import { dueStatus } from "@/modules/todos/service"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

import { ListManager } from "./list-manager"
import { QuickAdd } from "./quick-add"
import { TaskDialog } from "./task-dialog"
import { TaskItem } from "./task-item"

type Filter = "active" | "today" | "overdue" | "all"

const FILTERS: { key: Filter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "today", label: "Due today" },
  { key: "overdue", label: "Overdue" },
  { key: "all", label: "All" },
]

export function TodosView({
  tasks,
  lists,
  timeZone,
}: {
  tasks: TaskWithSeries[]
  lists: List[]
  timeZone: string
}) {
  const [filter, setFilter] = React.useState<Filter>("active")
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingTask, setEditingTask] =
    React.useState<TaskWithSeries | null>(null)
  const [listManagerOpen, setListManagerOpen] = React.useState(false)
  const [confirmSeries, setConfirmSeries] =
    React.useState<TaskWithSeries | null>(null)
  const [, startTransition] = React.useTransition()

  const [optimisticTasks, applyOptimistic] = React.useOptimistic<
    TaskWithSeries[],
    string
  >(
    tasks,
    (state, toggledId) =>
      state.map((task) =>
        task.id === toggledId
          ? {
              ...task,
              status: task.status === "open" ? ("done" as const) : ("open" as const),
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
    // Deleting a recurring instance stops the whole series (a single instance would
    // just regenerate on the next load) and drops its upcoming occurrences — not
    // cleanly undoable, so confirm first. One-off tasks delete with an Undo.
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

  function stopRepeating(task: TaskWithSeries) {
    if (!task.series) return
    startTransition(async () => {
      const result = await deleteTaskRecurrence(task.series!.id)
      if (!result.ok) toast.error(result.error)
      else toast("Stopped repeating")
    })
  }

  function openCreate() {
    setEditingTask(null)
    setDialogOpen(true)
  }

  function openEdit(task: TaskWithSeries) {
    setEditingTask(task)
    setDialogOpen(true)
  }

  const visible = optimisticTasks.filter((task) => {
    if (filter === "all") return true
    if (filter === "active") return task.status === "open"
    if (task.status !== "open") return false
    const status = dueStatus(task.dueDate, new Date(), timeZone)
    if (filter === "overdue") return status === "overdue"
    if (filter === "today") return status === "due-today"
    return true
  })

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            To-dos
          </h1>
          <p className="text-muted-foreground text-sm">Track what needs doing.</p>
        </div>
        <div className="flex gap-2">
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

      <div className="flex flex-col gap-2">
        {visible.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            Nothing here yet.
          </p>
        ) : (
          visible.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              timeZone={timeZone}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <TaskDialog
        lists={lists}
        task={editingTask}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
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
