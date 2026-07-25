"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { createTransaction } from "@/modules/budget/actions"
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
      toast.error("Couldn’t parse that — try “coffee $4” or “rent -1200 #housing”.")
      return
    }

    startTransition(async () => {
      const result = await createTransaction({ ...parsed, date })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Added ${parsed.description || "transaction"}`)
      setText("")
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
        disabled={pending}
        aria-label="Add transaction"
      >
        <Plus className="size-4" />
      </Button>
    </form>
  )
}
