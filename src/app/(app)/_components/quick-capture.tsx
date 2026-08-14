"use client"

import * as React from "react"
import { Plus, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { createTask } from "@/modules/todos/actions"
import { restoreIfEmpty } from "@/lib/forms"
import { parseNaturalDate } from "@/lib/nl-date"
import { todayInZone } from "@/lib/date"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { useCreateIntent } from "@/components/create/create-intent"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

// Short, human date for the confirmation toast ("Sat, Jul 26").
function formatDue(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

/**
 * Dashboard quick-capture: type a task in natural language ("call mom tomorrow",
 * "pay rent friday") — the due date is parsed out and the remaining text becomes the
 * title. Falls back to today's date when no date phrase is present.
 */
export function QuickCapture() {
  const [text, setText] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const { timeZone } = usePreferences()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return

    const today = todayInZone(new Date(), timeZone)
    const { date, cleaned } = parseNaturalDate(trimmed, today)
    const title = cleaned || trimmed
    const dueDate = date ?? today

    // Cleared here, synchronously, not after the await: the field is free for the next
    // entry immediately, and a second Enter has nothing left to resubmit.
    setText("")

    startTransition(async () => {
      const result = await createTask({ title, dueDate })
      if (result.ok) {
        toast.success(`Added “${title}”`, {
          description: `Due ${formatDue(dueDate)}`,
        })
      } else {
        toast.error(result.error)
        setText(restoreIfEmpty(trimmed))
      }
    })
  }

  return (
    <form
      onSubmit={submit}
      className="bg-card ring-foreground/5 flex items-center gap-2 rounded-xl p-2 shadow-sm ring-1"
    >
      <Sparkles className="text-brand-accent ml-1.5 size-4 shrink-0" />
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Quick add a task — try “pay rent friday” or “call mom tomorrow”"
        aria-label="Quick add a task"
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      <Button
        type="submit"
        size="sm"
        // Never `disabled`: a form whose submit button is disabled does no implicit
        // submission, so Enter would be dead while the previous entry was in flight and
        // anything typed in that window would vanish silently. Busy, not blocked.
        aria-busy={pending}
      >
        {/* Swapped, not merely `aria-busy`: that attribute alone renders NOTHING (the
            button's only busy style is a cursor, which a phone has no concept of), so
            these four bars — the surfaces built for fast capture — had no visible
            feedback at all. Same `size-4` box, so nothing shifts under a finger
            mid-burst. Still never `disabled`; see the note above. */}
        {pending ? <Spinner className="size-4" /> : <Plus className="size-4" />}
        Add
      </Button>
    </form>
  )
}

/** A "New task" affordance that opens the full task dialog in place (via the bus). */
export function NewTaskButton() {
  const requestCreate = useCreateIntent()
  return (
    <Button size="sm" onClick={() => requestCreate({ kind: "task" })}>
      <Plus className="size-4" />
      New task
    </Button>
  )
}
