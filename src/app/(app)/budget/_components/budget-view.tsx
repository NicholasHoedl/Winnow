"use client"

import * as React from "react"
import Link from "next/link"
import { LinkPending } from "@/components/shared/link-pending"
import {
  ChevronLeft,
  ChevronRight,
  FolderCog,
  Plus,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { accentForKey } from "@/lib/colors"
import { shiftMonth } from "@/lib/date"
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
import { Button, buttonVariants } from "@/components/ui/button"
import { DateJumpButton } from "@/components/shared/date-jump-button"

import { BudgetQuickAdd } from "./budget-quick-add"
import { BudgetsDialog } from "./budgets-dialog"
import { CategoryManager } from "./category-manager"
import { TransactionDialog } from "./transaction-dialog"
import { TransactionFilters } from "./transaction-filters"
import { TransactionItem } from "./transaction-item"

function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number)
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: string
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
    </div>
  )
}

export function BudgetView({
  month,
  today,
  categories,
  transactions,
  summary,
  filters,
  incomeSavings,
  trends,
}: {
  month: string
  today: string
  categories: Category[]
  transactions: TransactionWithSeries[]
  summary: MonthSummary
  filters: Filters
  // Server-rendered analysis sections. Passed in rather than imported so the SVG
  // charts inside them stay server components — this view is a client component.
  incomeSavings?: React.ReactNode
  trends?: React.ReactNode
}) {
  const [txOpen, setTxOpen] = React.useState(false)
  const [editingTx, setEditingTx] =
    React.useState<TransactionWithSeries | null>(null)
  const [categoriesOpen, setCategoriesOpen] = React.useState(false)
  const [budgetsOpen, setBudgetsOpen] = React.useState(false)
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

  // Categories with spend or a budget this month, alphabetized by name.
  const rows = [...summary.byCategory].sort((a, b) =>
    categoryName(a.categoryId).localeCompare(categoryName(b.categoryId)),
  )

  const expenseCategories = categories.filter((c) => c.kind === "expense")

  // The stats and the per-category rollup always describe the whole month; only the
  // transaction list narrows. Say so when a filter is on, or the numbers read wrong.
  const isFiltered =
    !!filters.q || !!filters.categoryId || !!filters.type || !!filters.sort

  // The budgets dialog only needs "what is budgeted per category this month", which
  // the summary already carries — no separate budgets fetch. Memoized so the dialog's
  // seeding effect doesn't see a new object on every render.
  const budgetedByCategory = React.useMemo(() => {
    const map: Record<string, number> = {}
    for (const row of summary.byCategory) {
      if (row.categoryId) map[row.categoryId] = row.budgetedCents
    }
    return map
  }, [summary])

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
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Budget
          </h1>
          <p className="text-muted-foreground text-sm">
            Track income and spending by category.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Manage categories"
            onClick={() => setCategoriesOpen(true)}
          >
            <FolderCog className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Set budgets"
            onClick={() => setBudgetsOpen(true)}
          >
            <Wallet className="size-4" />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </header>

      <div className="mb-4 flex items-center justify-center gap-1">
        <Link
          href={`/budget?month=${shiftMonth(month, -1)}`}
          aria-label="Previous month"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          {/* Same-route param change: the segment is not remounted, so `loading.tsx`
              never fires and nothing else in the app indicates this. */}
          <LinkPending className="size-4">
            <ChevronLeft className="size-4" />
          </LinkPending>
        </Link>
        <span className="min-w-40 text-center text-sm font-medium">
          {formatMonth(month)}
        </span>
        <Link
          href={`/budget?month=${shiftMonth(month, 1)}`}
          aria-label="Next month"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <LinkPending className="size-4">
            <ChevronRight className="size-4" />
          </LinkPending>
        </Link>
        <DateJumpButton
          selected={`${month}-01`}
          hrefFor={(d) => `/budget?month=${d.slice(0, 7)}`}
          ariaLabel="Jump to a month"
        />
        {month !== currentMonth && (
          <Link
            href="/budget"
            className={cn(buttonVariants({ variant: "link", size: "sm" }))}
          >
            This month
          </Link>
        )}
      </div>

      {/* A tighter gap on a phone buys each column ~5px, which is the difference between
          this fitting at 375px and not. Three narrow stats do not need 16px between them. */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border p-4 sm:gap-4">
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
      </div>

      <div className="mt-4">
        <BudgetQuickAdd date={defaultDate} categories={categories} />
      </div>

      {rows.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">
            By category
            {isFiltered && (
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                whole month
              </span>
            )}
          </h2>
          <div className="divide-y rounded-xl border">
            {rows.map((row) => {
              // Keyed by id so a category keeps its colour across months, sorts,
              // and both pages that render it.
              const accent = accentForKey(row.categoryId ?? "__uncat__")
              const hasBudget = row.budgetedCents > 0
              const percent = hasBudget
                ? Math.round((row.spentCents / row.budgetedCents) * 100)
                : 0
              const over = row.remainingCents < 0
              return (
                <div
                  key={row.categoryId ?? "__uncat__"}
                  className="flex flex-col gap-1.5 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          accent.bar,
                        )}
                      />
                      <span className="truncate">
                        {categoryName(row.categoryId)}
                      </span>
                    </span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {money(row.spentCents)}
                      {hasBudget && (
                        <span className="text-muted-foreground/70">
                          {" "}
                          / {money(row.budgetedCents)}
                        </span>
                      )}
                    </span>
                  </div>
                  {hasBudget && (
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          over ? "bg-destructive" : accent.bar,
                        )}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  )}
                  {hasBudget && (
                    <div
                      className={cn(
                        "text-right text-xs tabular-nums",
                        over ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {over
                        ? `${money(-row.remainingCents)} over`
                        : `${money(row.remainingCents)} left`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

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

      {incomeSavings}
      {trends}

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
      <CategoryManager
        categories={categories}
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
      />
      <BudgetsDialog
        month={month}
        categories={expenseCategories}
        budgetedByCategory={budgetedByCategory}
        open={budgetsOpen}
        onOpenChange={setBudgetsOpen}
      />
    </div>
  )
}
