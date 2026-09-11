"use client"

import * as React from "react"
import { AlertTriangle, Check, Pencil } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  receiptWarnings,
  resolveCategory,
  uncategorisedCount,
  type ReceiptWarning,
} from "@/modules/companion/service"
import type {
  ImportPayload,
  ImportProposalPayload,
  ImportRow,
  Receipt,
} from "@/modules/companion/validation"
import { amountToMinor, formatCents } from "@/modules/budget/service"
import { Segmented } from "@/components/shared/segmented"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type CategoryOption = { id: string; name: string }

const NO_CATEGORY = "__none__"

const TYPE_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const

/** Money the way the ledger shows it, from a major-unit figure. */
function money(amount: number, currency: string): string {
  return formatCents(amountToMinor(amount, currency), currency)
}

/**
 * Extracted transactions.
 *
 * **A dense row list, not the spine.** Forty rows on a timeline would be absurd — they
 * are not a sequence you read, they are a table you scan for the two that look wrong.
 * That is the whole reason the shared frame is header + footer + buttons and the body is
 * per-kind.
 *
 * Rows became editable in T33, and the reason is the receipt scanner. The stance until
 * then was that the field most likely to be wrong is the category, and the honest answer
 * for a mismatch on forty rows is to land them uncategorised and fix them in `/budget`.
 * A scanned receipt is two or three rows, and the field most likely to be wrong is the
 * AMOUNT — a smudged total, a line the model misread — which no amount of pruning fixes.
 * So a row opens into a small editor for its date, payee, amount, type, category and
 * description. The pasted import gets the same editor because there is one component;
 * pruning is still the fast path for it. Apply sends the rows back and the server
 * re-validates them, which is what makes the editing safe.
 */
export function ImportProposal({
  payload,
  categories,
  currency,
  pending,
  onApply,
  onDiscard,
}: {
  payload: ImportProposalPayload
  categories: CategoryOption[]
  currency: string
  pending: boolean
  onApply: (finalized: ImportPayload) => void
  onDiscard: () => void
}) {
  const [excluded, setExcluded] = React.useState<Set<number>>(new Set())
  // Edits replace rows by index; the payload itself is never mutated, so a remount by
  // `key` (a refinement) starts clean from what the server holds.
  const [rows, setRows] = React.useState<ImportRow[]>(payload.rows)
  const [editing, setEditing] = React.useState<number | null>(null)

  const scanned = payload.source === "receipt"
  const receipts = payload.receipts ?? []

  const final: ImportPayload = {
    rows: rows.filter((_, i) => !excluded.has(i)),
  }
  const unmatched = uncategorisedCount(final.rows, categories)

  function toggle(index: number) {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function update(index: number, next: ImportRow) {
    setRows((current) => current.map((row, i) => (i === index ? next : row)))
  }

  return (
    <div className="bg-card flex flex-col overflow-hidden rounded-xl border lg:min-h-0">
      <div className="border-b p-4">
        <p className="text-brand-accent text-xs font-medium">
          Transactions found
        </p>
        <h2 className="font-medium">
          {rows.length} row{rows.length === 1 ? "" : "s"} read from{" "}
          {scanned
            ? receipts.length > 1
              ? "your receipts"
              : "your receipt"
            : "what you pasted"}
        </h2>
      </div>

      {receipts.length > 0 && (
        <ReceiptsRead receipts={receipts} currency={currency} />
      )}

      <div className="max-h-[55svh] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
        <ul className="divide-y">
          {rows.map((row, index) => {
            const off = excluded.has(index)
            const category = resolveCategory(row.categoryName, categories)
            const open = editing === index
            return (
              <li
                key={index}
                className={cn("px-4 py-2 text-sm", off && "opacity-50")}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={!off}
                    aria-label={`Include ${row.payee}`}
                    onCheckedChange={() => toggle(index)}
                    className="shrink-0"
                  />
                  <span className="text-muted-foreground shrink-0 font-mono text-xs">
                    {row.date.slice(5)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn("block truncate", off && "line-through")}
                    >
                      {row.payee}
                    </span>
                    {row.description && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {row.description}
                      </span>
                    )}
                    {/* On a phone the category moves under the name. Inline, beside a
                        figure and a button that cannot shrink, it left the name two
                        letters wide at 393px. */}
                    <span
                      className={cn(
                        "block truncate text-xs sm:hidden",
                        category === null
                          ? "text-brand-accent"
                          : "text-muted-foreground",
                      )}
                    >
                      {category === null ? "Uncategorised" : row.categoryName}
                    </span>
                  </span>
                  {category === null ? (
                    <span className="text-brand-accent hidden shrink-0 items-center gap-1 text-xs sm:flex">
                      <AlertTriangle className="size-3" aria-hidden />
                      Uncategorised
                    </span>
                  ) : (
                    <span className="text-muted-foreground hidden max-w-40 shrink-0 truncate text-xs sm:inline-block">
                      {row.categoryName}
                    </span>
                  )}
                  <span
                    className={cn(
                      "shrink-0 font-mono text-xs tabular-nums",
                      row.type === "income"
                        ? "text-success"
                        : "text-foreground",
                    )}
                  >
                    {row.type === "income" ? "+" : "−"}
                    {money(row.amount, currency)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      open ? `Finish editing ${row.payee}` : `Edit ${row.payee}`
                    }
                    aria-expanded={open}
                    disabled={off}
                    onClick={() => setEditing(open ? null : index)}
                  >
                    {open ? (
                      <Check className="size-4" />
                    ) : (
                      <Pencil className="size-4" />
                    )}
                  </Button>
                </div>
                {open && !off && (
                  <RowEditor
                    row={row}
                    categories={categories}
                    onChange={(next) => update(index, next)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="bg-muted/40 flex items-center justify-between gap-3 border-t p-3">
        <p className="text-muted-foreground min-w-0 truncate text-xs">
          Creates{" "}
          <span className="text-foreground font-mono">{final.rows.length}</span>{" "}
          transaction{final.rows.length === 1 ? "" : "s"}
          {unmatched > 0 && (
            <span className="text-brand-accent">
              {" "}
              · <span className="font-mono">{unmatched}</span> uncategorised
            </span>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDiscard}
            disabled={pending}
          >
            Discard
          </Button>
          <Button
            size="sm"
            onClick={() => onApply(final)}
            disabled={pending || final.rows.length === 0}
          >
            {pending ? "Applying…" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * One row's fields, under the row. Plain controlled inputs: the server re-validates the
 * whole payload on Apply, so this only has to keep the row well-formed as it is typed —
 * an amount that is not a number leaves the row's figure where it was.
 */
function RowEditor({
  row,
  categories,
  onChange,
}: {
  row: ImportRow
  categories: CategoryOption[]
  onChange: (next: ImportRow) => void
}) {
  const [amountText, setAmountText] = React.useState(String(row.amount))
  const categoryId =
    resolveCategory(row.categoryName, categories) ?? NO_CATEGORY

  return (
    // A named group, so a spec can reach THESE fields: the ledger's filter bar has a
    // "Category" control of its own, and the two would otherwise collide.
    <div
      role="group"
      aria-label={`Edit ${row.payee}`}
      className="mt-2 grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-3"
    >
      <Input
        type="date"
        aria-label="Date"
        value={row.date}
        onChange={(event) => {
          if (event.target.value) onChange({ ...row, date: event.target.value })
        }}
      />
      <Input
        aria-label="Payee"
        value={row.payee}
        onChange={(event) => onChange({ ...row, payee: event.target.value })}
      />
      <Input
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        aria-label="Amount"
        value={amountText}
        onChange={(event) => {
          const text = event.target.value
          setAmountText(text)
          const amount = Number(text)
          if (text !== "" && Number.isFinite(amount) && amount >= 0)
            onChange({ ...row, amount })
        }}
      />
      <Segmented
        label="Type"
        value={row.type}
        options={TYPE_OPTIONS}
        onChange={(type) => onChange({ ...row, type })}
      />
      <Select
        value={categoryId}
        onValueChange={(value) => {
          if (value === null) return
          // The NAME is what the payload carries — `resolveCategory` turns it back into
          // this id at apply time, the same as for a name the model chose.
          const chosen = categories.find((category) => category.id === value)
          onChange({ ...row, categoryName: chosen?.name ?? null })
        }}
      >
        <SelectTrigger aria-label="Category" className="w-full">
          <SelectValue>
            {(value) =>
              categories.find((category) => category.id === value)?.name ??
              "Uncategorised"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CATEGORY}>Uncategorised</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        aria-label="Description"
        placeholder="Description"
        value={row.description}
        onChange={(event) =>
          onChange({ ...row, description: event.target.value })
        }
        className="sm:col-span-3"
      />
    </div>
  )
}

/** The receipt as the model read it, for checking the rows against the paper. */
function ReceiptsRead({
  receipts,
  currency,
}: {
  receipts: Receipt[]
  currency: string
}) {
  return (
    <div className="border-b px-4 py-3 text-xs">
      <p className="text-muted-foreground mb-1 font-medium">What it read</p>
      <ul className="flex flex-col gap-1">
        {receipts.map((receipt, index) => {
          const warnings = receiptWarnings(receipt)
          return (
            <li key={index}>
              <span className="font-medium">{receipt.merchant}</span>
              <span className="text-muted-foreground">
                {" "}
                · {receipt.date ?? "no date"} ·{" "}
                {receipt.total === null
                  ? "no total"
                  : money(receipt.total, currency)}{" "}
                · {receipt.items.length} line
                {receipt.items.length === 1 ? "" : "s"}
                {receipt.kind === "refund" && " · refund"}
              </span>
              {warnings.map((warning) => (
                <span
                  key={warning.kind}
                  className="text-brand-accent flex items-center gap-1"
                >
                  <AlertTriangle className="size-3 shrink-0" aria-hidden />
                  {describeWarning(warning, currency)}
                </span>
              ))}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function describeWarning(warning: ReceiptWarning, currency: string): string {
  switch (warning.kind) {
    case "no-date":
      return "No date was read; today's date is used."
    case "no-total":
      return "No total was read; the rows add up the lines instead."
    case "gap":
      return `The lines add up to ${money(warning.itemsTotal, currency)} but the total reads ${money(warning.total, currency)} — check the amounts.`
  }
}
