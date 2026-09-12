"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { createTask } from "@/modules/todos/actions"
import { parseTaskCapture, type ListOption } from "@/modules/todos/service"
import { todayInZone } from "@/lib/date"
import { restoreIfEmpty, tryWrite } from "@/lib/forms"
import {
  useDateLocale,
  usePreferences,
} from "@/components/preferences/preferences-provider"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"

// Short, human date for the confirmation toast ("Sat, Jul 26"). The dashboard bar's own
// copy, deliberately: the two bars read the same line through the same parser, so they
// report it in the same words. Local to each bar, as the app's other seven date formatters
// are.
function formatDue(date: string, locale: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function QuickAdd({ lists }: { lists: ListOption[] }) {
  const { defaultListId, timeZone } = usePreferences()
  const locale = useDateLocale()
  const [title, setTitle] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    // `#home` files it as it is captured; a line with no tag goes to the default list, if
    // one is set. The tag is stripped from the title either way, and so is a date written
    // in words — the dashboard's bar reads the same line through the same parser, so
    // "call mum tomorrow" cannot mean two different things on two screens (T41).
    const {
      title: taskTitle,
      dueDate,
      dueKind,
      listId,
    } = parseTaskCapture(trimmed, lists, todayInZone(new Date(), timeZone))
    const filedListId = listId ?? defaultListId ?? ""
    const listName = lists.find((list) => list.id === filedListId)?.name

    // Cleared here, synchronously, not after the await — see `restoreIfEmpty`.
    setTitle("")

    startTransition(async () => {
      // No date typed, NO due date — not today's. Quick-add is capture — get it out of
      // your head now, decide when later — so an undated line lands in Someday. The full
      // task dialog still prefills today, because opening it is already an act of
      // deliberate scheduling. Until T5a both paths defaulted to today, which made "no
      // due date" a state you had to go out of your way to produce, and left the Someday
      // bucket permanently empty.
      const result = await tryWrite(() =>
        createTask({
          title: taskTitle,
          ...(dueDate ? { dueDate, dueKind } : {}),
          listId: filedListId,
        }),
      )
      // Nothing came back: the server is unreachable and `tryWrite` has said so. The
      // line goes back in the box rather than into the void.
      if (!result) {
        setTitle(restoreIfEmpty(trimmed))
        return
      }
      if (!result.ok) {
        toast.error(result.error)
        setTitle(restoreIfEmpty(trimmed))
        return
      }
      // What was parsed, read back: this was the one capture bar that said nothing at all
      // when it worked, while the dashboard's, the budget's and the meals' all name what
      // they made (T43). The work worth confirming is the parsing — the tag taken out of
      // the title, a date read from the words — which is otherwise invisible until the
      // task is opened.
      //
      // The date is named only when one was READ. This bar leaves an undated line undated,
      // so a toast saying "Due" would be reporting a decision it deliberately did not make.
      const description = [
        dueDate &&
          `${dueKind === "by" ? "Due by" : "Due"} ${formatDue(dueDate, locale)}`,
        listName,
      ]
        .filter(Boolean)
        .join(" · ")
      toast.success(
        `Added “${taskTitle}”`,
        description ? { description } : undefined,
      )
    })
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Add a task… (#list files it)"
        aria-label="Quick add task"
      />
      <Button
        type="submit"
        size="icon"
        // Outline: the page's one fill belongs to "New task" in the header, which creates
        // the same thing this bar does. See the note in `quick-capture` (T39).
        variant="outline"
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
