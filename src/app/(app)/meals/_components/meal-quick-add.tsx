"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { logMeal } from "@/modules/meals/actions"
import { restoreIfEmpty } from "@/lib/forms"
import type { Food } from "@/modules/meals/queries"
import { parseMealQuickAdd } from "@/modules/meals/service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Natural-language meal capture for the viewed day: "banana x2" matches a library food;
 * "lunch 600cal 40p 30c 10f" logs explicit macros. Powered by the S5 parser.
 */
export function MealQuickAdd({ date, foods }: { date: string; foods: Food[] }) {
  const [text, setText] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return

    // Food[] is structurally assignable to FoodOption[].
    const parsed = parseMealQuickAdd(trimmed, foods)
    if (!parsed) {
      toast.error(
        "Couldn’t parse that — try “banana x2” or “lunch 600cal 40p 30c 10f”.",
      )
      return
    }

    // Cleared here, synchronously, not after the await — see `restoreIfEmpty`.
    setText("")

    startTransition(async () => {
      const result = await logMeal({ ...parsed, date })
      if (!result.ok) {
        toast.error(result.error)
        setText(restoreIfEmpty(trimmed))
        return
      }
      toast.success(`Logged ${parsed.name}`)
    })
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Quick add — “banana x2” or “lunch 600cal 40p”…"
        aria-label="Quick add meal"
      />
      <Button
        type="submit"
        size="icon"
        // Never `disabled`: a form whose submit button is disabled does no implicit
        // submission, so Enter would be dead while the previous entry was in flight and
        // anything typed in that window would vanish silently. Busy, not blocked.
        aria-busy={pending}
        aria-label="Add meal"
      >
        <Plus className="size-4" />
      </Button>
    </form>
  )
}
