import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import type { MonthSummary } from "@/modules/budget/service"
import type { MacroProgressSet } from "@/modules/meals/service"

import { StatCards } from "./stat-cards"

// The fold is a Server Action on the card shell around these tiles, not on them.
vi.mock("@/modules/preferences/actions", () => ({ setDashboardCard: vi.fn() }))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

/** Nothing eaten, nothing budgeted: the state a brand-new account is in. */
const EMPTY_MACROS: { progress: MacroProgressSet } = {
  progress: {
    calories: { consumed: 0, target: null, remaining: null, percent: null },
    protein: { consumed: 0, target: null, remaining: null, percent: null },
    carbs: { consumed: 0, target: null, remaining: null, percent: null },
    fat: { consumed: 0, target: null, remaining: null, percent: null },
  },
}

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
    <StatCards
      macros={EMPTY_MACROS}
      weight={null}
      budget={EMPTY_BUDGET}
      currency="USD"
      collapsed={{ macros: false, budget: false }}
      firstRun={firstRun}
    />,
  )
}

/**
 * T44 (Pass 10): the first-run panel exists to replace the cards' own empty sentences.
 *
 * It said so in its own comment and four cards went on printing theirs underneath it, so a
 * new account read "what do I do now" answered once and "there is nothing here" four more
 * times. The CARDS stay — a dashboard with holes in it is worse than an empty one; only
 * the sentence goes.
 */
describe("StatCards", () => {
  it("says what is empty when there is no first-run panel", () => {
    show()

    expect(screen.getByText("Nothing logged today.")).toBeInTheDocument()
    expect(screen.getByText("No activity yet this month.")).toBeInTheDocument()
  })

  it("says neither while the panel is up, and keeps both tiles", () => {
    show(true)

    expect(screen.queryByText("Nothing logged today.")).not.toBeInTheDocument()
    expect(
      screen.queryByText("No activity yet this month."),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Macros" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Budget" })).toBeInTheDocument()
  })
})
