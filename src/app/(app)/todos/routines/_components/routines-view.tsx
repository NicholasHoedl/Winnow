"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import {
  deleteRoutine,
  deleteRoutineItem,
  reorderRoutineItems,
  restoreRoutineItem,
} from "@/modules/routines/actions"
import type {
  RoutineItemRow,
  RoutineRow,
  RoutineWithItems,
} from "@/modules/routines/queries"
import { offsetLabel } from "@/modules/routines/service"
import { SortableList } from "@/components/shared/sortable-list"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { RoutineDialog } from "./routine-dialog"
import { type ListOption, RoutineItemDialog } from "./routine-item-dialog"
import { RunRoutineDialog } from "./run-routine-dialog"

function ItemRow({
  item,
  lists,
  onEdit,
  onDelete,
}: {
  item: RoutineItemRow
  lists: ListOption[]
  onEdit: (item: RoutineItemRow) => void
  onDelete: (item: RoutineItemRow) => void
}) {
  const listName = lists.find((l) => l.id === item.listId)?.name
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-muted-foreground text-xs">
          {offsetLabel(item.dueOffsetDays)}
          {item.priority !== "medium" && ` · ${item.priority} priority`}
          {listName && ` · ${listName}`}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${item.title}`}
          onClick={() => onEdit(item)}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${item.title}`}
          onClick={() => onDelete(item)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function RoutineCard({
  routine,
  lists,
  today,
  onEdit,
}: {
  routine: RoutineWithItems
  lists: ListOption[]
  today: string
  onEdit: (routine: RoutineRow) => void
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [runOpen, setRunOpen] = React.useState(false)
  const [itemOpen, setItemOpen] = React.useState(false)
  // Kept when the dialog closes so its contents don't swap mid-exit-animation.
  const [editingItem, setEditingItem] = React.useState<RoutineItemRow | null>(
    null,
  )
  const [, startTransition] = React.useTransition()
  // Reverts to the server's order automatically when the transition settles, so a
  // rejected reorder can't leave the list showing something that wasn't saved.
  const [items, setItems] = React.useOptimistic(routine.items)

  function openItem(item: RoutineItemRow | null) {
    setEditingItem(item)
    setItemOpen(true)
  }

  function handleReorder(ids: string[]) {
    startTransition(async () => {
      const byId = new Map(routine.items.map((item) => [item.id, item]))
      setItems(ids.flatMap((id) => byId.get(id) ?? []))
      const result = await reorderRoutineItems(ids)
      if (!result.ok) toast.error(result.error)
    })
  }

  function removeItem(item: RoutineItemRow) {
    startTransition(async () => {
      const result = await deleteRoutineItem(item.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.item ?? item
      toast("Task removed", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await restoreRoutineItem(restorable)
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  function removeRoutine() {
    startTransition(async () => {
      const result = await deleteRoutine(routine.id)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{routine.name}</h3>
          <p className="text-muted-foreground text-xs">
            {routine.description
              ? routine.description
              : `${items.length} ${items.length === 1 ? "task" : "tasks"}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            onClick={() => setRunOpen(true)}
            disabled={items.length === 0}
          >
            <Play className="size-4" />
            Run
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${routine.name}`}
                />
              }
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(routine)}>
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
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-sm">
          No tasks in this routine yet.
        </p>
      ) : (
        <SortableList
          items={items}
          onReorder={handleReorder}
          labelFor={(item) => item.title}
          renderItem={(item) => (
            <ItemRow
              item={item}
              lists={lists}
              onEdit={openItem}
              onDelete={removeItem}
            />
          )}
        />
      )}

      <div>
        <Button variant="outline" size="sm" onClick={() => openItem(null)}>
          <Plus className="size-4" />
          Add task
        </Button>
      </div>

      <RoutineItemDialog
        routineId={routine.id}
        item={editingItem}
        lists={lists}
        open={itemOpen}
        onOpenChange={setItemOpen}
      />
      <RunRoutineDialog
        routine={routine}
        today={today}
        open={runOpen}
        onOpenChange={setRunOpen}
      />
      {/* Confirm rather than undo: deleting a routine cascades its items, and there is
          no restore path for the pair. A single item gets an undo toast instead. */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${routine.name}?`}
        description="Its tasks template goes with it. Tasks you've already created from it are not affected."
        confirmLabel="Delete"
        onConfirm={removeRoutine}
      />
    </div>
  )
}

export function RoutinesView({
  routines,
  lists,
  today,
}: {
  routines: RoutineWithItems[]
  lists: ListOption[]
  today: string
}) {
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<RoutineRow | null>(null)

  function openRoutine(routine: RoutineRow | null) {
    setEditing(routine)
    setOpen(true)
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <Link
        href="/todos"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        To-dos
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Routines</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            A named set of tasks you can spin up whenever the occasion comes
            round.
          </p>
        </div>
        <Button className="sm:shrink-0" onClick={() => openRoutine(null)}>
          <Plus className="size-4" />
          New routine
        </Button>
      </div>

      {routines.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          No routines yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              lists={lists}
              today={today}
              onEdit={openRoutine}
            />
          ))}
        </div>
      )}

      <RoutineDialog routine={editing} open={open} onOpenChange={setOpen} />
    </div>
  )
}
