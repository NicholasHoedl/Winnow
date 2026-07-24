"use client"

import * as React from "react"
import { toast } from "sonner"

import { deleteBudget, setBudget } from "@/modules/budget/actions"
import type { Budget, Category } from "@/modules/budget/queries"
import {
  currencyFractionDigits,
  minorToAmount,
} from "@/modules/budget/service"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export function BudgetsDialog({
  month,
  categories,
  budgets,
  open,
  onOpenChange,
}: {
  month: string
  categories: Category[] // expense categories only
  budgets: Budget[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = React.useTransition()
  const [values, setValues] = React.useState<Record<string, string>>({})
  const { currency } = usePreferences()
  const digits = currencyFractionDigits(currency)
  const step = digits === 0 ? "1" : "0.01"
  const placeholder = digits === 0 ? "0" : "0.00"

  React.useEffect(() => {
    if (!open) return
    const next: Record<string, string> = {}
    for (const category of categories) {
      const existing = budgets.find((b) => b.categoryId === category.id)
      next[category.id] = existing
        ? String(minorToAmount(existing.amountCents, currency))
        : ""
    }
    setValues(next)
  }, [open, categories, budgets, currency])

  function save() {
    startTransition(async () => {
      let failed = false
      for (const category of categories) {
        const raw = (values[category.id] ?? "").trim()
        const existing = budgets.find((b) => b.categoryId === category.id)
        const amount = Number(raw)

        // Blank or zero clears the budget; a positive amount upserts it.
        if (raw === "" || amount === 0) {
          if (existing) {
            const res = await deleteBudget(existing.id)
            if (!res.ok) {
              toast.error(res.error)
              failed = true
            }
          }
          continue
        }
        if (!Number.isFinite(amount) || amount < 0) continue
        const res = await setBudget({ categoryId: category.id, month, amount })
        if (!res.ok) {
          toast.error(res.error)
          failed = true
        }
      }
      if (failed) return
      toast.success("Budgets saved")
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Monthly budgets</DialogTitle>
          <DialogDescription>
            Set a spending limit per expense category for this month. Leave a
            field blank for no limit.
          </DialogDescription>
        </DialogHeader>

        {categories.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Add an expense category first, then set its budget here.
          </p>
        ) : (
          <div className="max-h-72 space-y-3 overflow-y-auto">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-3"
              >
                <label
                  htmlFor={`b-${category.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium"
                >
                  {category.name}
                </label>
                <Input
                  id={`b-${category.id}`}
                  type="number"
                  step={step}
                  min="0"
                  inputMode="decimal"
                  placeholder={placeholder}
                  className="w-32"
                  value={values[category.id] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [category.id]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="mt-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || categories.length === 0}
            onClick={save}
          >
            {pending ? "Saving…" : "Save budgets"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
