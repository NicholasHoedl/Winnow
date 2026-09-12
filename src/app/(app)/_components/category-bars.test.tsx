import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import type { Category } from "@/modules/budget/queries"
import type { MonthSummary } from "@/modules/budget/service"

import { CategoryBars } from "./category-bars"

// The fold is a Server Action on the card shell around this card, not on it.
vi.mock("@/modules/preferences/actions", () => ({ setDashboardCard: vi.fn() }))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

const EMPTY_BUDGET = {
  incomeCents: 0,
  expenseCents: 0,
  netCents: 0,
  totalBudgetedCents: 0,
  monthlyBudgetCents: 0,
  byCategory: [],
  incomeByCategory: [],
} as MonthSummary

function show(firstRun = false) {
  return render(
    <CategoryBars
      budget={EMPTY_BUDGET}
      categories={[] as Category[]}
      currency="USD"
      collapsed={false}
      firstRun={firstRun}
    />,
  )
}

/** T44 (Pass 10) — the same rule as `stat-cards.test.tsx`, on the fourth card. */
describe("CategoryBars", () => {
  it("says what is empty when there is no first-run panel", () => {
    show()

    expect(
      screen.getByText("No spending or budgets yet this month."),
    ).toBeInTheDocument()
  })

  it("says nothing while the panel is up, and keeps the card", () => {
    show(true)

    expect(
      screen.queryByText("No spending or budgets yet this month."),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Categories" }),
    ).toBeInTheDocument()
  })
})
