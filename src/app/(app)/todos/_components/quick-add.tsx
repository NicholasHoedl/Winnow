"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { createTask } from "@/modules/todos/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function QuickAdd() {
  const [title, setTitle] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    startTransition(async () => {
      // NO due date. Quick-add is capture — get it out of your head now, decide when
      // later — so it lands in Someday. The full task dialog still prefills today,
      // because opening it is already an act of deliberate scheduling. Until T5a both
      // paths defaulted to today, which made "no due date" a state you had to go out of
      // your way to produce, and left the Someday bucket permanently empty.
      const result = await createTask({ title: trimmed })
      if (result.ok) {
        setTitle("")
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Add a task…"
        aria-label="Quick add task"
      />
      <Button
        type="submit"
        size="icon"
        disabled={pending}
        aria-label="Add task"
      >
        <Plus className="size-4" />
      </Button>
    </form>
  )
}
