import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { createTransaction } from "@/modules/budget/actions"
import type { Category } from "@/modules/budget/queries"
import type { PayeeMemory } from "@/modules/budget/service"

import { BudgetQuickAdd } from "./budget-quick-add"

// `"use server"` — importing for real drags in the database. Same treatment as
// `quick-add.test.tsx`: only the return value matters, and what this file is about is what
// the bar SENDS when the line it was given does not say everything.
vi.mock("@/modules/budget/actions", () => ({ createTransaction: vi.fn() }))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

/** Only the columns the parser reads. */
const CATEGORIES = [
  { id: "cat-food", name: "Food", kind: "expense" },
  { id: "cat-fun", name: "Fun", kind: "expense" },
  { id: "cat-pay", name: "Salary", kind: "income" },
] as unknown as Category[]

const MEMORY: PayeeMemory[] = [
  { payee: "Tesco", categoryId: "cat-food", type: "expense" },
  { payee: "Acme Ltd", categoryId: "cat-pay", type: "income" },
]

function type(text: string) {
  const input = screen.getByLabelText<HTMLInputElement>("Quick add transaction")
  fireEvent.change(input, { target: { value: text } })
  fireEvent.submit(input.closest("form")!)
}

/**
 * What the bar fills in that the line did not say (T36, Tesler).
 *
 * The parsing itself is `parseTransactionQuickAdd`'s unit test and the lookup is
 * `rememberedCategory`'s; what is only true HERE is which of the two answers wins when
 * they disagree, and that a line typed with a sign keeps the direction it asked for.
 */
describe("BudgetQuickAdd", () => {
  beforeEach(() => {
    vi.mocked(createTransaction).mockReset()
    vi.mocked(createTransaction).mockResolvedValue({ ok: true, id: "x1" })
    toast.error.mockReset()
    toast.success.mockReset()
  })

  function renderBar(memory: PayeeMemory[] = MEMORY) {
    return render(
      <BudgetQuickAdd
        date="2026-09-10"
        categories={CATEGORIES}
        payeeMemory={memory}
      />,
    )
  }

  it("files a line with no tag under the category that payee carried last time", async () => {
    renderBar()
    type("Tesco 45")

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith({
        amount: 45,
        type: "expense",
        categoryId: "cat-food",
        description: "Tesco",
        date: "2026-09-10",
      }),
    )
  })

  // The tag is what the line SAYS; memory only answers what it left out.
  it("lets a #tag win over what the payee was filed under", async () => {
    renderBar()
    type("Tesco 45 #fun")

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: "cat-fun" }),
      ),
    )
  })

  // The sign is an explicit answer too — "Acme Ltd 45" is money going out, whatever the
  // last Acme row was. The remembered category belongs to the other kind, so applying it
  // would file an expense against an income category, which the server rejects.
  it("keeps the direction the line asked for, and files nothing, when the two disagree", async () => {
    renderBar()
    type("Acme Ltd 45")

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type: "expense", categoryId: "" }),
      ),
    )
  })

  it("agrees with the sign when it can", async () => {
    renderBar()
    type("+2000 Acme Ltd")

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type: "income", categoryId: "cat-pay" }),
      ),
    )
  })

  it("leaves an unremembered payee uncategorised", async () => {
    renderBar()
    type("Sainsbury's 45")

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: "" }),
      ),
    )
  })
})
