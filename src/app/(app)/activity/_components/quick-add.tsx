"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { createTask } from "@/modules/todos/actions"
import { restoreIfEmpty } from "@/lib/forms"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"

export function QuickAdd() {
  const [title, setTitle] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    // Cleared here, synchronously, not after the await — see `restoreIfEmpty`.
    setTitle("")

    startTransition(async () => {
      // NO due date. Quick-add is capture — get it out of your head now, decide when
      // later — so it lands in Someday. The full task dialog still prefills today,
      // because opening it is already an act of deliberate scheduling. Until T5a both
      // paths defaulted to today, which made "no due date" a state you had to go out of
      // your way to produce, and left the Someday bucket permanently empty.
      const result = await createTask({ title: trimmed })
      if (!result.ok) {
        toast.error(result.error)
        setTitle(restoreIfEmpty(trimmed))
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
        // Never `disabled`: a form whose submit button is disabled does no implicit
        // submission, so Enter would be dead while the previous entry was in flight and
        // anything typed in that window would vanish silently. Busy, not blocked.
        aria-busy={pending}
        aria-label="Add task"
      >
        {/* Swapped, not merely `aria-busy`: that attribute alone renders NOTHING (the
            button's only busy style is a cursor, which a phone has no concept of), so
            these four bars — the surfaces built for fast capture — had no visible
            feedback at all. Same `size-4` box, so nothing shifts under a finger
            mid-burst. Still never `disabled`; see the note above. */}
        {pending ? <Spinner className="size-4" /> : <Plus className="size-4" />}
      </Button>
    </form>
  )
}
