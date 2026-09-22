import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import type { MonthSummary } from "@/modules/budget/service"
import { DEFAULT_PREFERENCES } from "@/lib/preferences"
import { PreferencesProvider } from "@/components/preferences/preferences-provider"

import { BudgetView } from "./budget-view"

// `"use server"` — importing for real drags in the database. The view and the quick-add
// bar under it import these; nothing is called by a render that only reads the page order.
vi.mock("@/modules/budget/actions", () => ({
  createTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  deleteTransactionRecurrence: vi.fn(),
  restoreTransaction: vi.fn(),
}))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

// The strip and the month control read the path, the filters the router and the query;
// outside Next's app router each of those throws.
vi.mock("next/navigation", () => ({
  usePathname: () => "/budget",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const EMPTY_MONTH: MonthSummary = {
  incomeCents: 0,
  expenseCents: 0,
  netCents: 0,
  totalBudgetedCents: 0,
  monthlyBudgetCents: 0,
  byCategory: [],
  incomeByCategory: [],
}

function renderView() {
  return render(
    <PreferencesProvider value={DEFAULT_PREFERENCES}>
      <BudgetView
        month="2026-09"
        today="2026-09-15"
        categories={[]}
        payeeMemory={[]}
        transactions={[]}
        summary={EMPTY_MONTH}
        filters={{}}
        aiTools={
          <div data-testid="ai-tools">Read transactions · Scan a receipt</div>
        }
      />
    </PreferencesProvider>,
  )
}

/** True when `later` comes after `earlier` in document order. */
function follows(earlier: Element, later: Element) {
  return !!(
    earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING
  )
}

describe("BudgetView", () => {
  it("puts the AI tools above the transactions list, under the quick-add bar", () => {
    renderView()
    const quickAdd = screen.getByLabelText("Quick add transaction")
    const aiTools = screen.getByTestId("ai-tools")
    const ledger = screen.getByRole("heading", { name: "Transactions" })

    expect(follows(quickAdd, aiTools)).toBe(true)
    expect(follows(aiTools, ledger)).toBe(true)
  })
})
