import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import type { ImportProposalPayload } from "@/modules/companion/validation"

import { ImportProposal } from "./import-proposal"

// The review's editing (T33): what Apply sends after a row is edited or switched off is
// the whole of what this component decides, so that is what is pinned here. The category
// picker is a base-ui Select, which jsdom cannot open; it is covered by the browser spec.

const CATEGORIES = [
  { id: "cat-food", name: "Food" },
  { id: "cat-games", name: "Games" },
]

const payload: ImportProposalPayload = {
  source: "receipt",
  rows: [
    {
      date: "2026-09-11",
      payee: "Walmart",
      description: "Eggs, Milk",
      amount: 10.91,
      type: "expense",
      categoryName: "Food",
    },
    {
      date: "2026-09-11",
      payee: "Walmart",
      description: "Video game",
      amount: 49.09,
      type: "expense",
      categoryName: "No Such Category",
    },
  ],
  receipts: [
    {
      merchant: "Walmart",
      date: "2026-09-11",
      total: 60,
      kind: "purchase",
      items: [
        { name: "Eggs", amount: 4, categoryName: "Food" },
        { name: "Milk", amount: 6, categoryName: "Food" },
        { name: "Video game", amount: 45, categoryName: "No Such Category" },
      ],
    },
  ],
}

function show(onApply = vi.fn()) {
  render(
    <ImportProposal
      payload={payload}
      categories={CATEGORIES}
      currency="USD"
      pending={false}
      onApply={onApply}
      onDiscard={vi.fn()}
    />,
  )
  return onApply
}

describe("ImportProposal", () => {
  it("says where the rows came from, and shows what the receipt read", () => {
    show()
    expect(screen.getByText("2 rows read from your receipt")).toBeTruthy()
    expect(screen.getByText("What it read")).toBeTruthy()
    expect(screen.getByText(/3 lines/)).toBeTruthy()
    // 55 of lines against 60 paid is tax, not a misread: no warning.
    expect(screen.queryByText(/check the amounts/)).toBeNull()
    // The footer's figures sit in their own spans, so match on the paragraph's text.
    expect(screen.getByText(/Creates/).textContent).toContain("1 uncategorised")
  })

  it("sends an edited amount on Apply, and leaves the other row alone", () => {
    const onApply = show()
    // Two rows share a payee; the button names are the same, so take them in order.
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Walmart" })[1])
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "50" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(onApply).toHaveBeenCalledTimes(1)
    const sent = onApply.mock.calls[0][0]
    expect(sent.rows).toHaveLength(2)
    expect(sent.rows[0].amount).toBe(10.91)
    expect(sent.rows[1].amount).toBe(50)
    // Only the rows go back; the reading stays on the server's copy.
    expect(sent).not.toHaveProperty("receipts")
  })

  it("keeps the row's figure when the typed amount is not a number", () => {
    const onApply = show()
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Walmart" })[0])
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(onApply.mock.calls[0][0].rows[0].amount).toBe(10.91)
  })

  it("drops a switched-off row from what Apply sends", () => {
    const onApply = show()
    fireEvent.click(
      screen.getAllByRole("checkbox", { name: "Include Walmart" })[0],
    )
    expect(screen.getByText(/Creates/).textContent).toContain("1")
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(onApply.mock.calls[0][0].rows).toEqual([payload.rows[1]])
  })

  it("flags a total the lines do not explain", () => {
    render(
      <ImportProposal
        payload={{
          ...payload,
          receipts: [{ ...payload.receipts![0], total: 100 }],
        }}
        categories={CATEGORIES}
        currency="USD"
        pending={false}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText(/check the amounts/)).toBeTruthy()
  })
})
