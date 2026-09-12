import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import {
  createTransaction,
  createTransactionRecurrence,
  updateTransaction,
  updateTransactionRecurrence,
} from "@/modules/budget/actions"
import type { Category, TransactionWithSeries } from "@/modules/budget/queries"
import type { PayeeMemory } from "@/modules/budget/service"
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

const MEMORY: PayeeMemory[] = [
  { payee: "Landlord", categoryId: "cat-rent", type: "expense" },
  { payee: "Acme Ltd", categoryId: "cat-pay", type: "income" },
]

/**
 * Choose an item in a base-ui `Select` — the helper `task-dialog.test.tsx` carries. The
 * popup opens on a plain click (`PointerEvent` is polyfilled in `vitest.setup.ts`), but an
 * item commits on its key handler, so Enter on the option is what picks it.
 */
function pickOption(label: string, option: string) {
  fireEvent.click(screen.getByLabelText(label))
  fireEvent.keyDown(screen.getByRole("option", { name: option }), {
    key: "Enter",
  })
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
        payeeMemory={[]}
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
 * The Type and Category controls are here only for what the dialog FILLS IN by itself —
 * see `pickOption` for how far a base-ui `Select` can be driven under jsdom. What each
 * control does with a chosen value on the way to the server is still a browser journey and
 * stays in `e2e/`; so does Repeat, whose answer changes which of the four actions runs.
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

  // A new transaction used to open on "0", which is not an amount anyone means — it is a
  // placeholder you have to select and overtype before typing the figure you came to type.
  it("opens a new transaction with an empty amount", () => {
    show()
    expect(screen.getByLabelText(/Amount/)).toHaveValue(null)
  })

  // T41 (Pass 7): every other money field in the app asks a phone for the decimal keypad;
  // this one, the one you type an amount into most often, opened the full keyboard.
  it("asks a phone for the decimal keypad", () => {
    show()
    expect(screen.getByLabelText(/Amount/)).toHaveAttribute(
      "inputmode",
      "decimal",
    )
  })

  // The label above the scope buttons named nothing, so "This one" and "Schedule" were
  // read out with no word about what they applied to.
  it("names the scope toggle after its label", () => {
    show({ transaction: row({ series: SERIES }) })

    expect(
      screen.getByRole("group", { name: "Apply changes to" }),
    ).toContainElement(screen.getByRole("button", { name: "Schedule" }))
  })

  it("says what to do when the amount is left empty", async () => {
    show()

    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() =>
      expect(screen.getByText("Enter an amount")).toBeInTheDocument(),
    )
    expect(createTransaction).not.toHaveBeenCalled()
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

  // Tesler: "Tesco" has been filed under Groceries a dozen times, so the thirteenth is the
  // app's to answer. The TYPE comes with it — a category belongs to one kind, and setting
  // the category alone would be dropped by the effect that clears a category the type
  // cannot hold.
  it("files a payee under the category it carried last time", () => {
    show({ payeeMemory: MEMORY })

    fireEvent.change(screen.getByLabelText("Payee"), {
      target: { value: "  acme   ltd " },
    })
    fireEvent.blur(screen.getByLabelText("Payee"))

    expect(screen.getByLabelText("Type")).toHaveTextContent("Income")
    expect(screen.getByLabelText("Category")).toHaveTextContent("Salary")
  })

  // A type picked by hand is an explicit statement, the way the quick-add bar's sign is:
  // "Acme Ltd 45" is money going out whatever the last Acme row said. Memory does not
  // argue with it, and the category it remembers belongs to the other kind anyway.
  it("keeps a type the user picked, and files nothing when the two disagree", () => {
    show({ payeeMemory: MEMORY })

    pickOption("Type", "Income")
    fireEvent.change(screen.getByLabelText("Payee"), {
      target: { value: "Landlord" },
    })
    fireEvent.blur(screen.getByLabelText("Payee"))

    expect(screen.getByLabelText("Type")).toHaveTextContent("Income")
    expect(screen.getByLabelText("Category")).toHaveTextContent("No category")
  })

  it("still files the category when the type they picked agrees", () => {
    show({ payeeMemory: MEMORY })

    pickOption("Type", "Income")
    fireEvent.change(screen.getByLabelText("Payee"), {
      target: { value: "Acme Ltd" },
    })
    fireEvent.blur(screen.getByLabelText("Payee"))

    expect(screen.getByLabelText("Type")).toHaveTextContent("Income")
    expect(screen.getByLabelText("Category")).toHaveTextContent("Salary")
  })

  // Memory fills a blank, it does not correct you.
  it("leaves a category the user has already chosen alone", () => {
    show({ payeeMemory: MEMORY })

    pickOption("Category", "Rent")
    fireEvent.change(screen.getByLabelText("Payee"), {
      target: { value: "Acme Ltd" },
    })
    fireEvent.blur(screen.getByLabelText("Payee"))

    expect(screen.getByLabelText("Category")).toHaveTextContent("Rent")
    expect(screen.getByLabelText("Type")).toHaveTextContent("Expense")
  })

  // An edit is about one row that already happened. Re-filing it from what OTHER rows say
  // would rewrite a record the ledger is supposed to keep.
  it("fills nothing in when editing an existing transaction", () => {
    show({ payeeMemory: MEMORY, transaction: row({ payee: "Acme Ltd" }) })

    fireEvent.blur(screen.getByLabelText("Payee"))

    expect(screen.getByLabelText("Category")).toHaveTextContent("No category")
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
