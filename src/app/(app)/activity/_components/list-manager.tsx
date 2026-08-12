"use client"

import * as React from "react"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { createList, deleteList, renameList } from "@/modules/todos/actions"
import type { List } from "@/modules/todos/queries"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export function ListManager({
  lists,
  open,
  onOpenChange,
}: {
  lists: List[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  /**
   * One field, two jobs — the shape `CalendarManager` already uses. A dedicated row-level
   * edit input would be a second place to type a list name, and this dialog is four lines
   * tall; the cost of reusing the field is that the list below it is the only thing saying
   * WHICH name is being edited, which is why the edit affordance also focuses the input.
   */
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lists</DialogTitle>
          <DialogDescription>
            Group tasks into lists. Renaming one keeps its tasks; deleting one
            keeps them too (they become unlisted).
          </DialogDescription>
        </DialogHeader>

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

        <ul className="flex flex-col gap-1">
          {lists.length === 0 ? (
            <li className="text-muted-foreground text-sm">No lists yet.</li>
          ) : (
            lists.map((list) => (
              <li
                key={list.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <span className="min-w-0 truncate">{list.name}</span>
                <span className="flex shrink-0 items-center">
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
      </DialogContent>
    </Dialog>
  )
}
