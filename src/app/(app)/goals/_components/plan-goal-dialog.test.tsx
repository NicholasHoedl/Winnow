import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import type { GoalWithProgress } from "@/modules/goals/queries"

import { PlanGoalDialog } from "./plan-goal-dialog"

const GOALS = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Learn Japanese" },
] as unknown as GoalWithProgress[]

function show(busy: boolean) {
  render(
    <PlanGoalDialog
      goals={GOALS}
      plannedGoalIds={[]}
      busy={busy}
      open
      onOpenChange={vi.fn()}
      onPlan={vi.fn()}
    />,
  )
}

/**
 * What a 90-second wait looks like, at the trigger that starts one.
 *
 * `GENERATE_TIMEOUT_MS` is 90 seconds and the five AI triggers changed one word each —
 * "Plan" to "Thinking…" — for the whole of it. Two things were missing and this pins both
 * at the site they are easiest to reach: the moving mark that says work is happening (the
 * capture bars' `Spinner` swap, chosen over `aria-busy` alone, which renders nothing), and
 * the sentence that says how long it can run. Without the sentence, a wait this far outside
 * the app's own 200ms reads as a hang at about the ten-second mark.
 */
describe("PlanGoalDialog while a plan is generating", () => {
  it("swaps the target for a spinner and says how long this can take", () => {
    show(true)

    const plan = screen.getByRole("button", { name: "Thinking…" })
    expect(plan.querySelector("[data-pending]")).not.toBeNull()
    expect(plan).toBeDisabled()
    expect(screen.getByText(/up to a minute and a half/i)).toBeTruthy()
  })

  it("says none of that before you ask", () => {
    show(false)

    const plan = screen.getByRole("button", { name: "Plan" })
    expect(plan.querySelector("[data-pending]")).toBeNull()
    expect(screen.queryByText(/up to a minute and a half/i)).toBeNull()
  })
})
