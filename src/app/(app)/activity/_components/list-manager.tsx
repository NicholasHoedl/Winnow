"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { createList, deleteList } from "@/modules/todos/actions"
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

  function add(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await createList({ name: trimmed })
      if (result.ok) setName("")
      else toast.error(result.error)
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteList(id)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lists</DialogTitle>
          <DialogDescription>
            Group tasks into lists. Deleting a list keeps its tasks (they become
            unlisted).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={add} className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New list name"
            aria-label="New list name"
          />
          <Button type="submit" size="icon" disabled={pending} aria-label="Add list">
            <Plus className="size-4" />
          </Button>
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${list.name}`}
                  onClick={() => remove(list.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
