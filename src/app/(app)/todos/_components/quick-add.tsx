"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { createTask } from "@/modules/todos/actions"
import { todayInZone } from "@/modules/todos/service"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function QuickAdd() {
  const [title, setTitle] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const { timeZone } = usePreferences()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    startTransition(async () => {
      // Default the due date to today, matching the full task dialog.
      const result = await createTask({
        title: trimmed,
        dueDate: todayInZone(new Date(), timeZone),
      })
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
      <Button type="submit" size="icon" disabled={pending} aria-label="Add task">
        <Plus className="size-4" />
      </Button>
    </form>
  )
}
