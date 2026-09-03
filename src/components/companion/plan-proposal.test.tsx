import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import type { GoalPlanPayload } from "@/modules/companion/validation"

import { PlanProposal } from "./plan-proposal"

// jsdom implements no `PointerEvent` and base-ui's `Checkbox` constructs one on click. See
// the note in `(app)/_components/slate.test.tsx` for why supplying the constructor is not
// the accommodation the Select tests refuse.
if (!("PointerEvent" in window)) {
  // @ts-expect-error — a constructor is all base-ui asks for.
  window.PointerEvent = class extends MouseEvent {}
}

const GOAL = {
  targetDate: null,
  targetValue: null,
  currentValue: null,
  unit: null,
}

function payload(over: Partial<GoalPlanPayload> = {}): GoalPlanPayload {
  return {
    milestones: [
      { title: "Learn the first 250 words", dueDate: "2026-10-01" },
      { title: "Hold a five-minute conversation", dueDate: "2026-12-01" },
    ],
    habits: [
      {
        title: "Study vocabulary",
        period: "day",
        targetCount: 1,
        targetAmount: null,
        unit: null,
      },
    ],
    setupTasks: [{ title: "Buy the textbook" }],
    ...over,
  } as unknown as GoalPlanPayload
}

function show(props: Partial<React.ComponentProps<typeof PlanProposal>> = {}) {
  const onApply = vi.fn()
  const onDiscard = vi.fn()
  render(
    <PlanProposal
      payload={payload()}
      onChange={vi.fn()}
      goalTitle="Learn Japanese"
      goal={GOAL}
      today="2026-09-03"
      pending={false}
      onApply={onApply}
      onDiscard={onDiscard}
      {...props}
    />,
  )
  return { onApply, onDiscard }
}

/**
 * The review step between a model's answer and the writes it becomes.
 *
 * Two things here are worth a test and are awkward to reach through a browser, because
 * getting to this component at all needs a configured provider and a generated plan.
 *
 * The first is that pruning a row actually removes it from what Apply SENDS. `finalizePlan`
 * is pure and has its own tests; what those cannot see is whether the checkbox is wired to
 * it — and the failure mode is the worst kind, because the UI would show the row struck out
 * while the write created it anyway.
 *
 * The second is that EVERY plan-level warning renders. Only one used to, which
 * `docs/HANDOFF.md` records as a latent shortcoming that `rate-short` gave a third way to
 * happen: an empty plan raises both `no-habits` and `no-milestones`, and a user told only
 * half of what is wrong with a plan fixes half of it.
 */
describe("PlanProposal", () => {
  beforeEach(() => vi.clearAllMocks())

  it("applies the whole plan when nothing is pruned", () => {
    const { onApply } = show()

    fireEvent.click(screen.getByRole("button", { name: "Apply" }))

    expect(onApply).toHaveBeenCalledTimes(1)
    const sent = onApply.mock.calls[0][0] as GoalPlanPayload
    expect(sent.milestones).toHaveLength(2)
    expect(sent.habits).toHaveLength(1)
    expect(sent.setupTasks).toHaveLength(1)
  })

  // The one that matters: unticking a row has to reach the payload, not just the styling.
  it("drops a pruned milestone from what Apply sends", () => {
    const { onApply } = show()

    fireEvent.click(screen.getByLabelText("Include Learn the first 250 words"))
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))

    const sent = onApply.mock.calls[0][0] as GoalPlanPayload
    expect(sent.milestones.map((m) => m.title)).toEqual([
      "Hold a five-minute conversation",
    ])
    // The rest is untouched — pruning one list must not disturb another.
    expect(sent.habits).toHaveLength(1)
    expect(sent.setupTasks).toHaveLength(1)
  })

  it("shows every plan-level warning, not just the first", () => {
    show({ payload: payload({ milestones: [], habits: [] }) })

    expect(screen.getByText(/No recurring practice/)).toBeInTheDocument()
    expect(screen.getByText(/No milestones/)).toBeInTheDocument()
  })

  it("discards without applying", () => {
    const { onApply, onDiscard } = show()

    fireEvent.click(screen.getByRole("button", { name: "Discard" }))

    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })
})
