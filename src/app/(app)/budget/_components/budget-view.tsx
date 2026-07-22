"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, FolderCog, Plus, Wallet } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { deleteTransaction, restoreTransaction } from "@/modules/budget/actions"
import type { Budget, Category, Transaction } from "@/modules/budget/queries"
import { formatCents, type MonthSummary } from "@/modules/budget/service"
import { Button, buttonVariants } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

import { BudgetsDialog } from "./budgets-dialog"
import { CategoryManager } from "./category-manager"
import { TransactionDialog } from "./transaction-dialog"
import { TransactionItem } from "./transaction-item"

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(year, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

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
      <span className={cn("text-lg font-semibold tabular-nums", className)}>
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
  budgets,
  summary,
}: {
  month: string
  today: string
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  summary: MonthSummary
}) {
  const [txOpen, setTxOpen] = React.useState(false)
  const [editingTx, setEditingTx] = React.useState<Transaction | null>(null)
  const [categoriesOpen, setCategoriesOpen] = React.useState(false)
  const [budgetsOpen, setBudgetsOpen] = React.useState(false)
  const [, startTransition] = React.useTransition()

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

  function openCreate() {
    setEditingTx(null)
    setTxOpen(true)
  }

  function openEdit(tx: Transaction) {
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
          <ChevronLeft className="size-4" />
        </Link>
        <span className="min-w-40 text-center text-sm font-medium">
          {formatMonth(month)}
        </span>
        <Link
          href={`/budget?month=${shiftMonth(month, 1)}`}
          aria-label="Next month"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ChevronRight className="size-4" />
        </Link>
        {month !== currentMonth && (
          <Link
            href="/budget"
            className={cn(buttonVariants({ variant: "link", size: "sm" }))}
          >
            This month
          </Link>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 rounded-xl border p-4">
        <Stat
          label="Income"
          value={formatCents(summary.incomeCents)}
          className="text-emerald-600 dark:text-emerald-400"
        />
        <Stat label="Expenses" value={formatCents(summary.expenseCents)} />
        <Stat
          label="Net"
          value={formatCents(summary.netCents)}
          className={
            summary.netCents < 0
              ? "text-destructive"
              : "text-emerald-600 dark:text-emerald-400"
          }
        />
      </div>

      {rows.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">By category</h2>
          <div className="divide-y rounded-xl border">
            {rows.map((row) => {
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
                    <span className="font-medium">
                      {categoryName(row.categoryId)}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatCents(row.spentCents)}
                      {hasBudget && (
                        <span className="text-muted-foreground/70">
                          {" "}
                          / {formatCents(row.budgetedCents)}
                        </span>
                      )}
                    </span>
                  </div>
                  {hasBudget && <Progress value={Math.min(percent, 100)} />}
                  {hasBudget && (
                    <div
                      className={cn(
                        "text-right text-xs tabular-nums",
                        over ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {over
                        ? `${formatCents(-row.remainingCents)} over`
                        : `${formatCents(row.remainingCents)} left`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Transactions</h2>
        {transactions.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            Nothing recorded this month.
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
              />
            ))}
          </div>
        )}
      </section>

      <TransactionDialog
        defaultDate={defaultDate}
        categories={categories}
        transaction={editingTx}
        open={txOpen}
        onOpenChange={setTxOpen}
      />
      <CategoryManager
        categories={categories}
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
      />
      <BudgetsDialog
        month={month}
        categories={expenseCategories}
        budgets={budgets}
        open={budgetsOpen}
        onOpenChange={setBudgetsOpen}
      />
    </div>
  )
}
