"use client"

import * as React from "react"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { shiftMonth } from "@/lib/date"
import { copyBudgetsFromMonth, setBudgets } from "@/modules/budget/actions"
import type { Category } from "@/modules/budget/queries"
import {
  amountToMinor,
  currencyFractionDigits,
  formatCents,
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

// Amounts stay strings in the form so a cleared field reads as "no budget" rather
// than a literal 0 in every row; they're converted on submit and the server's Zod
// schema is authoritative (the same plain-RHF approach the task dialog uses).
type BudgetsFormValues = {
  /** The month's total; blank for none. */
  total: string
  entries: { categoryId: string; amount: string }[]
}

export function BudgetsDialog({
  month,
  categories,
  budgetedByCategory,
  monthlyBudgetCents,
  open,
  onOpenChange,
}: {
  month: string
  categories: Category[] // expense categories only
  /** categoryId → currently budgeted minor units for this month. */
  budgetedByCategory: Record<string, number>
  /** The total in effect for this month, in minor units; 0 for none. */
  monthlyBudgetCents: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { currency } = usePreferences()
  const digits = currencyFractionDigits(currency)
  const step = digits === 0 ? "1" : "0.01"
  const placeholder = digits === 0 ? "0" : "0.00"
  const [copying, startCopy] = React.useTransition()

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<BudgetsFormValues>({
    defaultValues: { total: "", entries: [] },
  })
  const { fields } = useFieldArray({ control, name: "entries" })

  // One row per expense category, seeded from this month's budgets on open.
  React.useEffect(() => {
    if (!open) return
    reset({
      total:
        monthlyBudgetCents > 0
          ? String(minorToAmount(monthlyBudgetCents, currency))
          : "",
      entries: categories.map((category) => {
        const cents = budgetedByCategory[category.id] ?? 0
        return {
          categoryId: category.id,
          amount: cents > 0 ? String(minorToAmount(cents, currency)) : "",
        }
      }),
    })
  }, [
    open,
    categories,
    budgetedByCategory,
    monthlyBudgetCents,
    currency,
    reset,
  ])

  const onSubmit = handleSubmit(async (data) => {
    const result = await setBudgets({
      month,
      // Blank clears the total from this month on, same as 0.
      monthlyTotal: data.total.trim() === "" ? 0 : Number(data.total),
      entries: data.entries.map((entry) => ({
        categoryId: entry.categoryId,
        // Blank clears the budget, same as 0.
        amount: entry.amount.trim() === "" ? 0 : Number(entry.amount),
      })),
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Budgets saved")
    onOpenChange(false)
  })

  function copyLastMonth() {
    startCopy(async () => {
      const result = await copyBudgetsFromMonth({
        fromMonth: shiftMonth(month, -1),
        toMonth: month,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.copied === 0
          ? "Last month had no budgets to copy"
          : `Copied ${result.copied} budget${result.copied === 1 ? "" : "s"}`,
      )
      // Close so the dialog re-seeds from the refreshed month on next open.
      onOpenChange(false)
    })
  }

  const busy = isSubmitting || copying

  // Live, and only a warning: the categories are limits on parts of the month and the
  // total is a limit on all of it, so the parts adding up to more than the whole is
  // almost certainly a slip — but not one this dialog should refuse to save. `useWatch`
  // rather than `watch()`, which the React Compiler cannot memoize around.
  const totalText = useWatch({ control, name: "total" })
  const entryValues = useWatch({ control, name: "entries" })
  const total = Number(totalText) || 0
  const categoriesTotal = entryValues.reduce(
    (sum, entry) => sum + (Number(entry.amount) || 0),
    0,
  )
  const overTotal = total > 0 && categoriesTotal > total

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Monthly budgets</DialogTitle>
          <DialogDescription>
            A total for the month, and a limit per expense category if you want
            one. Leave a field blank for no limit.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          {/* The one thing about the total that a field on one month's dialog cannot show
              is that it stands for the months after it — so the hint says so. */}
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="b-total"
              className="min-w-0 flex-1 text-sm font-medium"
            >
              Total for the month
            </label>
            <Input
              id="b-total"
              type="number"
              step={step}
              min="0"
              inputMode="decimal"
              placeholder={placeholder}
              className="w-32"
              {...register("total")}
            />
          </div>
          <p className="text-muted-foreground mt-1.5 text-xs">
            Everything you spend, measured against one figure. It stays in
            effect for the months after this one until you change it.
          </p>
          {overTotal && (
            <p role="status" className="text-muted-foreground mt-1.5 text-xs">
              Your categories add up to{" "}
              {formatCents(amountToMinor(categoriesTotal, currency), currency)},
              more than the total.
            </p>
          )}

          <div className="mt-4 max-h-72 space-y-3 overflow-y-auto">
            {categories.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Add an expense category to set a limit for it here.
              </p>
            )}
            {fields.map((field, index) => {
              const category = categories.find((c) => c.id === field.categoryId)
              return (
                <div
                  key={field.id}
                  className="flex items-center justify-between gap-3"
                >
                  <label
                    htmlFor={`b-${field.categoryId}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium"
                  >
                    {category?.name}
                  </label>
                  <Input
                    id={`b-${field.categoryId}`}
                    type="number"
                    step={step}
                    min="0"
                    inputMode="decimal"
                    placeholder={placeholder}
                    className="w-32"
                    {...register(`entries.${index}.amount`)}
                  />
                </div>
              )
            })}
          </div>

          <DialogFooter className="mt-5 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={copyLastMonth}
              disabled={busy}
            >
              {copying ? "Copying…" : "Copy last month"}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {isSubmitting ? "Saving…" : "Save budgets"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
