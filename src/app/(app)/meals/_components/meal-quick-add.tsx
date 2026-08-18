"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { logMeal } from "@/modules/meals/actions"
import { restoreIfEmpty } from "@/lib/forms"
import type { Food } from "@/modules/meals/queries"
import { parseMealQuickAdd } from "@/modules/meals/service"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"

/**
 * Natural-language meal capture for the viewed day: "banana x2" matches a library food;
 * "lunch 600cal 40p 30c 10f" logs explicit macros. Powered by the S5 parser.
 */
export function MealQuickAdd({ date, foods }: { date: string; foods: Food[] }) {
  const [text, setText] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const { defaultMealType } = usePreferences()

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
      const result = await logMeal({
        ...parsed,
        // A meal type typed into the text ALWAYS wins — `parseMealQuickAdd` returns `""`
        // when it found none, and only then does the preference apply. Otherwise setting a
        // default would quietly override "lunch 600cal", which is the one case where the
        // user said which meal it was.
        mealType: parsed.mealType || (defaultMealType ?? ""),
        date,
      })
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
