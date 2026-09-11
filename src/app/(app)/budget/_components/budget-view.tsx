"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  deleteTransaction,
  deleteTransactionRecurrence,
  restoreTransaction,
} from "@/modules/budget/actions"
import type {
  Category,
  Transaction,
  TransactionWithSeries,
} from "@/modules/budget/queries"
import {
  formatCents,
  type MonthSummary,
  type TransactionFilters as Filters,
} from "@/modules/budget/service"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

import { BudgetHeader } from "./budget-header"
import { BudgetQuickAdd } from "./budget-quick-add"
import { TransactionDialog } from "./transaction-dialog"
import { TransactionFilters } from "./transaction-filters"
import { TransactionItem } from "./transaction-item"

function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: string
  /** A second, smaller line under the figure — what is left of a budget, say. */
  hint?: React.ReactNode
  className?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      {/* Smaller on a phone, because a currency figure cannot wrap and this column is
          93px at 393px: `$12,345.67` renders at 96px in Bricolage Grotesque and lay across
          the column beside it. Shrinking the type rather than stacking the three stats —
          stacking buys certainty at the cost of three rows of vertical space at the top of
          the page, and a summary you have to scroll past is worse than a smaller one. */}
      <span
        className={cn(
          "text-base font-semibold tabular-nums sm:text-lg",
          className,
        )}
      >
        {value}
      </span>
      {hint && (
        <span className="text-muted-foreground text-xs tabular-nums">
          {hint}
        </span>
      )}
    </div>
  )
}

/**
 * The ledger: the month's stats, quick add, the transaction list with its filters, and
 * the AI import under it.
 *
 * Until T30 this was the whole Budget section — the by-category bars, both charts and
 * two editor dialogs behind a ⋮ menu sat here too. They are pages in the strip now
 * (ADR-0024), and what is left is the ledger the way the Tasks page is tasks.
 */
export function BudgetView({
  month,
  today,
  categories,
  transactions,
  summary,
  filters,
  aiTools,
}: {
  month: string
  today: string
  categories: Category[]
  transactions: TransactionWithSeries[]
  summary: MonthSummary
  filters: Filters
  /**
   * "Read transactions" and "Scan a receipt", or null when the companion is off.
   *
   * A client element that holds its own state, passed in rather than imported because the
   * page is what knows whether the feature is configured and this view should not have
   * to ask.
   */
  aiTools?: React.ReactNode
}) {
  const [txOpen, setTxOpen] = React.useState(false)
  const [editingTx, setEditingTx] =
    React.useState<TransactionWithSeries | null>(null)
  const [stoppingTx, setStoppingTx] = React.useState<Transaction | null>(null)
  const [, startTransition] = React.useTransition()
  const { currency } = usePreferences()
  const money = (cents: number) => formatCents(cents, currency)

  const currentMonth = today.slice(0, 7)
  const defaultDate = month === currentMonth ? today : `${month}-01`

  const categoryName = React.useCallback(
    (id: string | null) =>
      id == null
        ? "Uncategorized"
        : (categories.find((c) => c.id === id)?.name ?? "Uncategorized"),
    [categories],
  )

  // The stats always describe the whole month; only the transaction list narrows. Say so
  // when a filter is on, or the numbers read wrong.
  const isFiltered =
    !!filters.q || !!filters.categoryId || !!filters.type || !!filters.sort

  const hasBudget = summary.totalBudgetedCents > 0
  const overBudget =
    hasBudget && summary.expenseCents > summary.totalBudgetedCents

  function handleDelete(tx: Transaction) {
    startTransition(async () => {
      const result = await deleteTransaction(tx.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.transaction ?? tx
      toast("Transaction removed", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await restoreTransaction(restorable)
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  // Deleting the rule only stops future posts — the FK is ON DELETE SET NULL, so
  // everything it already posted stays put as ordinary history. No undo offered: the
  // transactions survive, and re-creating the schedule is the reverse.
  function stopRepeating(tx: Transaction) {
    const seriesId = tx.seriesId
    if (!seriesId) return
    startTransition(async () => {
      const result = await deleteTransactionRecurrence(seriesId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Stopped repeating")
    })
  }

  function openCreate() {
    setEditingTx(null)
    setTxOpen(true)
  }

  function openEdit(tx: TransactionWithSeries) {
    setEditingTx(tx)
    setTxOpen(true)
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <BudgetHeader
        month={month}
        today={today}
        action={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add
          </Button>
        }
      />

      {/* A tighter gap on a phone buys each column ~5px, which is the difference between
          this fitting at 375px and not. Three narrow stats do not need 16px between them.
          A fourth would not fit beside them at all — `$12,345.67` is 96px and a quarter of
          a phone is less — so with a budget to show the grid goes two by two on a phone. */}
      <div
        className={cn(
          "grid gap-2 rounded-xl border p-4 sm:gap-4",
          hasBudget ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3",
        )}
      >
        <Stat
          label="Income"
          value={money(summary.incomeCents)}
          className="text-success"
        />
        <Stat label="Expenses" value={money(summary.expenseCents)} />
        <Stat
          label="Net"
          value={money(summary.netCents)}
          className={summary.netCents < 0 ? "text-destructive" : "text-success"}
        />
        {hasBudget && (
          <Stat
            // "Budget" is the total you set. "Budgeted" is the category limits added
            // up, which is what the month is measured against until a total exists.
            label={summary.monthlyBudgetCents > 0 ? "Budget" : "Budgeted"}
            value={money(summary.totalBudgetedCents)}
            hint={
              overBudget ? (
                <span className="text-destructive">
                  {money(summary.expenseCents - summary.totalBudgetedCents)}{" "}
                  over
                </span>
              ) : (
                `${money(summary.totalBudgetedCents - summary.expenseCents)} left`
              )
            }
          />
        )}
      </div>

      <div className="mt-4">
        <BudgetQuickAdd date={defaultDate} categories={categories} />
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Transactions</h2>
          {isFiltered && (
            <span className="text-muted-foreground text-xs">
              Filtered — {transactions.length} shown
            </span>
          )}
        </div>
        <TransactionFilters categories={categories} filters={filters} />
        {transactions.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            {isFiltered
              ? "No transactions match these filters."
              : "Nothing recorded this month."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {transactions.map((tx) => (
              <TransactionItem
                key={tx.id}
                transaction={tx}
                categoryName={categoryName(tx.categoryId)}
                onEdit={openEdit}
                onDelete={handleDelete}
                onStopRepeating={setStoppingTx}
              />
            ))}
          </div>
        )}
      </section>

      {/* Under the ledger: it proposes rows for the list you just scrolled past, so it
          reads in that order. */}
      {aiTools && <div className="mt-6">{aiTools}</div>}

      <TransactionDialog
        defaultDate={defaultDate}
        month={month}
        today={today}
        categories={categories}
        transaction={editingTx}
        open={txOpen}
        onOpenChange={setTxOpen}
      />
      <ConfirmDialog
        open={stoppingTx !== null}
        onOpenChange={(next) => !next && setStoppingTx(null)}
        title="Stop repeating?"
        description="No more transactions will be added on this schedule. The ones already recorded are kept."
        confirmLabel="Stop repeating"
        onConfirm={() => {
          if (stoppingTx) stopRepeating(stoppingTx)
          setStoppingTx(null)
        }}
      />
    </div>
  )
}
