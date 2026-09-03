import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import {
  createTransaction,
  createTransactionRecurrence,
  updateTransaction,
  updateTransactionRecurrence,
} from "@/modules/budget/actions"
import type { Category, TransactionWithSeries } from "@/modules/budget/queries"
import { DEFAULT_PREFERENCES } from "@/lib/preferences"
import { PreferencesProvider } from "@/components/preferences/preferences-provider"

import { TransactionDialog } from "./transaction-dialog"

// `"use server"` — importing for real drags in the database. Same treatment as
// `quick-add.test.tsx`; only the return value matters, and what this file is about is
// WHICH of the four the dialog picks and what it does with the answer.
vi.mock("@/modules/budget/actions", () => ({
  createTransaction: vi.fn(),
  createTransactionRecurrence: vi.fn(),
  updateTransaction: vi.fn(),
  updateTransactionRecurrence: vi.fn(),
}))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

/**
 * Only the columns the dialog reads. The real rows carry a dozen more it never touches, and
 * spelling them out would make the fixture the biggest thing in the file without making any
 * assertion below more true.
 */
const CATEGORIES = [
  { id: "cat-rent", name: "Rent", kind: "expense" },
  { id: "cat-pay", name: "Salary", kind: "income" },
] as unknown as Category[]

const SERIES = {
  id: "rule-1",
  amountCents: 120000,
  type: "expense",
  categoryId: null,
  payee: null,
  description: null,
  freq: "monthly",
  recurrenceInterval: 1,
  weekdays: 0,
  monthlyMode: "day_of_month",
  startDate: "2026-01-01",
  endDate: null,
}

function row(over: Record<string, unknown> = {}): TransactionWithSeries {
  return {
    id: "txn-1",
    amountCents: 123456,
    type: "expense",
    date: "2026-09-10",
    categoryId: null,
    payee: null,
    description: null,
    series: null,
    ...over,
  } as unknown as TransactionWithSeries
}

function show(
  props: Partial<React.ComponentProps<typeof TransactionDialog>> = {},
) {
  return render(
    <PreferencesProvider value={DEFAULT_PREFERENCES}>
      <TransactionDialog
        defaultDate="2026-09-10"
        month="2026-09"
        today="2026-09-10"
        categories={CATEGORIES}
        transaction={null}
        open
        onOpenChange={vi.fn()}
        {...props}
      />
    </PreferencesProvider>,
  )
}

/**
 * The dialog's dispatch and its error paths.
 *
 * Unit rather than e2e for the reason `quick-add.test.tsx` gives: these are the branches a
 * browser reaches most expensively. Proving the four-way dispatch through `/budget` costs
 * four full journeys — one of them requiring a recurring transaction to exist first — and
 * the two error paths need the SERVER to reject, which a browser test cannot arrange
 * without breaking the app underneath it.
 *
 * What is deliberately NOT here: anything that needs the Type, Category or Repeat control.
 * All three are base-ui `Select`s, which drive a popover through pointer events that jsdom
 * does not implement, so a test that appeared to exercise them would really be exercising
 * whatever polyfill it shipped with. Those stay in `e2e/`, where the browser is real.
 */
describe("TransactionDialog", () => {
  beforeEach(() => {
    vi.mocked(createTransaction).mockReset()
    vi.mocked(createTransactionRecurrence).mockReset()
    vi.mocked(updateTransaction).mockReset()
    vi.mocked(updateTransactionRecurrence).mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
  })

  // Money is stored in integer cents on purpose (SPEC §7.3 calls it a correctness
  // requirement, not a nice-to-have), so the conversion back out is a place a wrong answer
  // is both easy to write and hard to notice — 123456 rendering as 123456 looks like a big
  // number, not like a bug.
  it("shows a stored amount in major units, not in cents", () => {
    show({ transaction: row({ amountCents: 123456 }) })
    expect(screen.getByLabelText(/Amount/)).toHaveValue(1234.56)
  })

  it("sends a new one-off to createTransaction", async () => {
    vi.mocked(createTransaction).mockResolvedValue({ ok: true })
    show()

    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "12.34" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1))
    expect(createTransactionRecurrence).not.toHaveBeenCalled()
  })

  // "Editing a posted row edits that row — the ledger is a record of what happened, not a
  // template." The rule behind it is reachable only through the scope toggle, and this pins
  // that a plain Save never reaches it.
  it("edits the posted row, not the schedule behind it", async () => {
    vi.mocked(updateTransaction).mockResolvedValue({ ok: true })
    show({ transaction: row({ series: SERIES }) })

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(updateTransaction).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateTransaction).mock.calls[0][0]).toBe("txn-1")
    expect(updateTransactionRecurrence).not.toHaveBeenCalled()
  })

  it("edits the schedule once the scope toggle says so", async () => {
    vi.mocked(updateTransactionRecurrence).mockResolvedValue({ ok: true })
    show({ transaction: row({ series: SERIES }) })

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() =>
      expect(updateTransactionRecurrence).toHaveBeenCalledTimes(1),
    )
    expect(vi.mocked(updateTransactionRecurrence).mock.calls[0][0]).toBe(
      "rule-1",
    )
    expect(updateTransaction).not.toHaveBeenCalled()
  })

  // The path a browser cannot arrange: the server rejecting a field. Without this the
  // mapping is only exercised when something is genuinely broken in production.
  it("puts a server field error on the field that caused it", async () => {
    vi.mocked(createTransaction).mockResolvedValue({
      ok: false,
      error: "Could not save that.",
      fieldErrors: { amount: "More than the account holds." },
    })
    show()

    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "5" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() =>
      expect(
        screen.getByText("More than the account holds."),
      ).toBeInTheDocument(),
    )
    expect(toast.error).toHaveBeenCalledWith("Could not save that.")
  })
})
