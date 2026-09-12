import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import type { ProposalRow } from "@/modules/companion/queries"

import { RoutinesView } from "./routines-view"

// `"use server"` — importing either of these for real drags in the database. Same
// treatment as `meals-view.test.tsx`; nothing here calls one.
vi.mock("@/modules/routines/actions", () => ({
  addRoutineItem: vi.fn(),
  createRoutine: vi.fn(),
  deleteRoutine: vi.fn(),
  deleteRoutineItem: vi.fn(),
  reorderRoutineItems: vi.fn(),
  restoreRoutineItem: vi.fn(),
  runRoutine: vi.fn(),
  undoRoutineRun: vi.fn(),
  updateRoutine: vi.fn(),
  updateRoutineItem: vi.fn(),
}))
vi.mock("@/modules/companion/actions", () => ({
  applyProposal: vi.fn(),
  discardProposal: vi.fn(),
  undoApply: vi.fn(),
}))

// `useCreateFlag` reads the URL as it renders, and outside Next's app router that throws.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/activity/routines",
  useSearchParams: () => new URLSearchParams(),
}))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

/**
 * T44 (Pass 10): an empty state says what the thing is for.
 *
 * Habits, Lists and Repeating each answer "what is this page for" in the box where the
 * list would be — the one place a reader with nothing to look at is looking. Routines said
 * "No routines yet." and stopped, on the one of the four hardest to guess from its name.
 */
describe("RoutinesView", () => {
  it("says what a routine is when there are none", () => {
    render(
      <RoutinesView
        routines={[]}
        lists={[]}
        today="2026-09-12"
        pending={[] as ProposalRow[]}
        companionEnabled={false}
      />,
    )

    expect(screen.getByText(/A routine is a set of tasks/)).toBeInTheDocument()
  })
})
