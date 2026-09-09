"use client"

import * as React from "react"
import Link from "next/link"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { createList, deleteList, renameList } from "@/modules/todos/actions"
import type { List, ListTaskCounts } from "@/modules/todos/queries"
import { UNFILED } from "@/modules/todos/service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { ActivityHeader } from "../../_components/activity-header"

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
      if (!result.ok) toast.error(result.error)
      // Deleting the list being edited would otherwise leave the form pointed at a row
      // that no longer exists, and submitting it would write to nothing in silence.
      else if (editingId === id) cancelEdit()
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
            <Link
              href={`/activity?list=${UNFILED}`}
              className="hover:text-foreground text-muted-foreground min-w-0 truncate"
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
                  className="min-w-0 truncate font-medium hover:underline"
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
                    onClick={() => remove(list.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
