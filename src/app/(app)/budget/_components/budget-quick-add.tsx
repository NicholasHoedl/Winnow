"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { createTransaction } from "@/modules/budget/actions"
import { restoreIfEmpty, tryWrite } from "@/lib/forms"
import type { Category } from "@/modules/budget/queries"
import {
  amountToMinor,
  formatCents,
  parseTransactionQuickAdd,
  rememberedCategory,
  type PayeeMemory,
} from "@/modules/budget/service"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"

/**
 * Natural-language transaction capture for the viewed month: "coffee $4" → an expense;
 * "rent -1200 #housing" → resolves the category by name; "+2000 paycheck" → income.
 * Powered by the S5 parser; stamps the view's default date.
 */
export function BudgetQuickAdd({
  date,
  categories,
  payeeMemory,
}: {
  date: string
  categories: Category[]
  /** What each payee was last filed under, newest first — used when the line names no
   *  `#tag` of its own. */
  payeeMemory: PayeeMemory[]
}) {
  const [text, setText] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  // Only for the toast below: the row itself is written in major units and shaped by the
  // server, as it always was.
  const { currency } = usePreferences()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return

    // Category[] is structurally assignable to CategoryOption[].
    const parsed = parseTransactionQuickAdd(trimmed, categories)
    if (!parsed) {
      toast.error(
        "Couldn’t parse that — try “coffee $4” or “rent -1200 #housing”.",
      )
      return
    }

    // No `#tag`: file it the way this payee was filed last time (T36). What is left of
    // the line after the amount comes out IS the payee here — the bar has no separate
    // field for one — so that is what the memory is asked about.
    //
    // A remembered category of the OTHER kind is dropped rather than applied: the sign is
    // an explicit answer ("-45" is money going out, whatever last time said), and filing
    // an expense against an income category is what the server rejects anyway.
    const remembered = parsed.categoryId
      ? null
      : rememberedCategory(payeeMemory, parsed.description)
    const categoryId =
      remembered && remembered.type === parsed.type
        ? remembered.categoryId
        : parsed.categoryId

    // Cleared here, synchronously, not after the await — see `restoreIfEmpty`.
    setText("")

    startTransition(async () => {
      const result = await tryWrite(() =>
        createTransaction({ ...parsed, categoryId, date }),
      )
      // Nothing came back: the server is unreachable and `tryWrite` has said so. The
      // line goes back in the box rather than into the void.
      if (!result) {
        setText(restoreIfEmpty(trimmed))
        return
      }
      if (!result.ok) {
        toast.error(result.error)
        setText(restoreIfEmpty(trimmed))
        return
      }
      // A line that is all amount and tag — "+500 #bonus" — leaves nothing to name the
      // row by, and the fallback named the KIND of thing that happened rather than the
      // thing. The amount is always there, and the category is there whenever the tag or
      // the payee memory resolved one.
      const filed = categoryId
        ? categories.find((category) => category.id === categoryId)
        : undefined
      toast.success(
        parsed.description
          ? `Added ${parsed.description}`
          : `Added ${formatCents(amountToMinor(parsed.amount, currency), currency)}${
              filed ? ` to ${filed.name}` : ""
            }`,
      )
    })
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Quick add — “coffee $4” or “rent -1200 #housing”…"
        aria-label="Quick add transaction"
      />
      <Button
        type="submit"
        size="icon"
        // Outline: the page's one fill belongs to "Add" in the header, which opens the
        // full form for the same transaction. See the note in `quick-capture` (T39).
        variant="outline"
        // Never `disabled`: a form whose submit button is disabled does no implicit
        // submission, so Enter would be dead while the previous entry was in flight and
        // anything typed in that window would vanish silently. Busy, not blocked.
        aria-busy={pending}
        aria-label="Add transaction"
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
