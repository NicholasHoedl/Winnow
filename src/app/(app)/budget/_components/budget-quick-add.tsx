"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { createTransaction } from "@/modules/budget/actions"
import { restoreIfEmpty } from "@/lib/forms"
import type { Category } from "@/modules/budget/queries"
import { parseTransactionQuickAdd } from "@/modules/budget/service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Natural-language transaction capture for the viewed month: "coffee $4" → an expense;
 * "rent -1200 #housing" → resolves the category by name; "+2000 paycheck" → income.
 * Powered by the S5 parser; stamps the view's default date.
 */
export function BudgetQuickAdd({
  date,
  categories,
}: {
  date: string
  categories: Category[]
}) {
  const [text, setText] = React.useState("")
  const [pending, startTransition] = React.useTransition()

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

    // Cleared here, synchronously, not after the await — see `restoreIfEmpty`.
    setText("")

    startTransition(async () => {
      const result = await createTransaction({ ...parsed, date })
      if (!result.ok) {
        toast.error(result.error)
        setText(restoreIfEmpty(trimmed))
        return
      }
      toast.success(`Added ${parsed.description || "transaction"}`)
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
        // Never `disabled`: a form whose submit button is disabled does no implicit
        // submission, so Enter would be dead while the previous entry was in flight and
        // anything typed in that window would vanish silently. Busy, not blocked.
        aria-busy={pending}
        aria-label="Add transaction"
      >
        <Plus className="size-4" />
      </Button>
    </form>
  )
}
