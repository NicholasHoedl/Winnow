"use client"

import * as React from "react"
import Link from "next/link"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { createList, deleteList, renameList } from "@/modules/todos/actions"
import type { List, ListTaskCounts } from "@/modules/todos/queries"
import { UNFILED } from "@/modules/todos/service"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { ActivityHeader } from "../../_components/activity-header"

/**
 * What deleting one does to the tasks filed under it, said before it happens.
 *
 * `tasks.list_id` is `ON DELETE SET NULL`, so nothing is destroyed — which is exactly why
 * the sentence matters: the tasks MOVE, to Unfiled, and until T42 that happened on one
 * click with no confirm, no toast and no undo. "open", because the open count is what the
 * page loads and what the row beside this button is showing.
 */
function unfilingSentence(name: string, open: number): string {
  if (open === 0) {
    return `“${name}” will be deleted. No open task is filed under it.`
  }
  const tasks = open === 1 ? "1 open task stays" : `${open} open tasks stay`
  return `“${name}” will be deleted. Its ${tasks}, unfiled.`
}

/**
 * Lists — create, rename, delete — as a page of the Activity section, and since T26 the
 * way INTO each one: a name links to the Tasks page filtered to it, with its open count
 * beside it, and Unfiled heads the column as the pile to triage from.
 *
 * This was `ListManager`, a dialog behind the ⋮ menu on `/activity`. The form is the same:
 * one field with two jobs (the shape `CalendarManager` uses — a row-level edit input would
 * be a second place to type a list name), a row per list. ADR-0020 says why it is a
 * destination now.
 */
export function ListsView({
  lists,
  counts,
}: {
  lists: List[]
  counts: ListTaskCounts
}) {
  const [name, setName] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const [confirmTarget, setConfirmTarget] = React.useState<List | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = editingId
        ? await renameList(editingId, { name: trimmed })
        : await createList({ name: trimmed })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setEditingId(null)
      setName("")
    })
  }

  // The list below the field is the only thing saying WHICH name is being edited, which is
  // why the edit affordance also focuses the input.
  function startEdit(list: List) {
    setEditingId(list.id)
    setName(list.name)
    inputRef.current?.focus()
  }

  function cancelEdit() {
    setEditingId(null)
    setName("")
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteList(id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      // Deleting the list being edited would otherwise leave the form pointed at a row
      // that no longer exists, and submitting it would write to nothing in silence.
      if (editingId === id) cancelEdit()
      // No Undo: restoring the list would not re-file the tasks it had, and a button
      // that puts back half of what it promises is worse than none. The confirmation
      // above is what this delete gets instead.
      toast("List deleted")
    })
  }

  const editingName = lists.find((list) => list.id === editingId)?.name

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <ActivityHeader description="A list is a standing place for tasks — Home, Work, Errands — which is what a goal is not. Renaming one keeps its tasks; deleting one keeps them too, unfiled. Type #home in quick-add to file a task as you capture it." />

      {/* Narrower than the page: a name field and a column of names do not want 900px,
          and the rows would read as a table with one column. */}
      <div className="max-w-xl">
        <form onSubmit={submit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={editingId ? "List name" : "New list name"}
            aria-label={editingId ? "List name" : "New list name"}
          />
          <Button
            type="submit"
            size="icon"
            disabled={pending}
            aria-label={editingId ? `Save ${editingName}` : "Add list"}
          >
            {editingId ? (
              <Check className="size-4" />
            ) : (
              <Plus className="size-4" />
            )}
          </Button>
          {editingId && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Cancel rename"
              onClick={cancelEdit}
            >
              <X className="size-4" />
            </Button>
          )}
        </form>

        <ul className="mt-4 flex flex-col gap-1">
          {/* Unfiled first, always, and dashed: it is not a list you made but the tasks
              that have none, and its count is the thing worth glancing at — a growing pile
              here is the sign the lists are not being used. */}
          <li className="flex items-center justify-between gap-2 rounded-md border border-dashed p-2 text-sm">
            {/* `py-1 -my-1`, here and on each list below: the name is the way into the
                list and it was a 20px target in a 40px row. The padding takes it to 28
                and the negative margin gives the height back to the row, so the target
                fills the row it sits in without the row changing (T40). No `inline-flex`
                to go with it — these truncate, and a flex box does not pass an ellipsis
                down to the text inside it. */}
            <Link
              href={`/activity?list=${UNFILED}`}
              className="hover:text-foreground text-muted-foreground -my-1 min-w-0 truncate py-1"
            >
              Unfiled
            </Link>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {counts.unfiled} open
            </span>
          </li>
          {lists.length === 0 ? (
            <li className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
              No lists yet. A task can be filed under one from its dialog.
            </li>
          ) : (
            lists.map((list) => (
              <li
                key={list.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <Link
                  href={`/activity?list=${list.id}`}
                  className="-my-1 min-w-0 truncate py-1 font-medium hover:underline"
                >
                  {list.name}
                </Link>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-muted-foreground pr-1 text-xs tabular-nums">
                    {counts.byList[list.id] ?? 0} open
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Rename ${list.name}`}
                    onClick={() => startEdit(list)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${list.name}`}
                    disabled={pending}
                    onClick={() => setConfirmTarget(list)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(next) => !next && setConfirmTarget(null)}
        title="Delete this list?"
        description={
          confirmTarget
            ? unfilingSentence(
                confirmTarget.name,
                counts.byList[confirmTarget.id] ?? 0,
              )
            : undefined
        }
        confirmLabel="Delete list"
        onConfirm={() => {
          if (confirmTarget) remove(confirmTarget.id)
        }}
      />
    </div>
  )
}
