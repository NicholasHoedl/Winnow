import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { PLAN_CAPS, type GoalPlanPayload } from "@/modules/companion/validation"

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
      existingCommitments={0}
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

/**
 * Adding rows, which the panel could not do until now — the model's plan was the only
 * plan, and a step it had missed meant discarding the whole thing or adding it by hand on
 * another page afterwards.
 *
 * These need a CONTROLLED harness, unlike the tests above. `show` passes a no-op
 * `onChange`, which is enough for pruning — that lives in the component's own `excluded`
 * state — but an added row goes through `onChange` and comes back as a new `payload`, so a
 * harness that drops it would render nothing and assert nothing.
 */
describe("PlanProposal — adding", () => {
  beforeEach(() => vi.clearAllMocks())

  function controlled(initial: GoalPlanPayload = payload()) {
    const onApply = vi.fn()
    function Harness() {
      const [current, setCurrent] = React.useState(initial)
      return (
        <PlanProposal
          payload={current}
          onChange={setCurrent}
          goalTitle="Learn Japanese"
          goal={GOAL}
          today="2026-09-03"
          existingCommitments={0}
          pending={false}
          onApply={onApply}
          onDiscard={vi.fn()}
        />
      )
    }
    render(<Harness />)
    return { onApply }
  }

  const applied = (onApply: ReturnType<typeof vi.fn>) =>
    onApply.mock.calls[0][0] as GoalPlanPayload

  it("adds a milestone that Apply does not create until it is named", () => {
    const { onApply } = controlled()

    fireEvent.click(screen.getByRole("button", { name: "Add a milestone" }))
    // The row is on screen…
    expect(screen.getByLabelText("Milestone 3 title")).toBeTruthy()
    // …and the counter, which exists so Apply never does more than the number beside it,
    // has not moved.
    expect(screen.getByText("2").textContent).toBe("2")

    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(applied(onApply).milestones).toHaveLength(2)
  })

  it("creates the added milestone once it has a title", () => {
    const { onApply } = controlled()

    fireEvent.click(screen.getByRole("button", { name: "Add a milestone" }))
    fireEvent.change(screen.getByLabelText("Milestone 3 title"), {
      target: { value: "Sit the N4 exam" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))

    const sent = applied(onApply)
    expect(sent.milestones).toHaveLength(3)
    expect(sent.milestones[2].title).toBe("Sit the N4 exam")
    // Dated after the last step, not today — appending means "and then this".
    expect(sent.milestones[2].dueDate).toBe("2026-12-01")
  })

  it("adds a session habit at three a week", () => {
    const { onApply } = controlled()

    fireEvent.click(screen.getByRole("button", { name: "Add a practice" }))
    fireEvent.change(screen.getByLabelText("Habit 2 title"), {
      target: { value: "Speak with a tutor" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))

    const sent = applied(onApply)
    expect(sent.habits).toHaveLength(2)
    expect(sent.habits[1]).toMatchObject({
      title: "Speak with a tutor",
      period: "week",
      targetCount: 3,
      targetAmount: null,
      unit: null,
    })
  })

  it("offers a practice even when the plan proposed none", () => {
    // The case the `no-habits` warning is about. The section used to hide itself when
    // empty, which took the only way of fixing it with it.
    controlled(payload({ habits: [] }))
    expect(screen.getByRole("button", { name: "Add a practice" })).toBeTruthy()
  })

  it("stops at the cap rather than letting the apply fail on it", () => {
    controlled(
      payload({
        milestones: Array.from({ length: PLAN_CAPS.milestones }, (_, i) => ({
          title: `Step ${i + 1}`,
          dueDate: "2026-10-01",
        })),
      }),
    )
    expect(
      screen.getByRole("button", { name: "Add a milestone" }),
    ).toBeDisabled()
  })

  /**
   * The invariant that makes appending safe.
   *
   * `excluded` holds INDEXES into these arrays. Appending cannot disturb them; inserting
   * or removing anywhere else silently repoints every exclusion after the change — a
   * checkbox unticked on step 1 coming back applied to step 2. That is the renumbering
   * bug `finalizePlan`'s note describes, and this is the test that would catch it being
   * reintroduced.
   */
  it("leaves an existing exclusion pointing at the same row", () => {
    const { onApply } = controlled()

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Include Learn the first 250 words",
      }),
    )
    fireEvent.click(screen.getByRole("button", { name: "Add a milestone" }))
    fireEvent.change(screen.getByLabelText("Milestone 3 title"), {
      target: { value: "Sit the N4 exam" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))

    const titles = applied(onApply).milestones.map((m) => m.title)
    expect(titles).toEqual([
      "Hold a five-minute conversation",
      "Sit the N4 exam",
    ])
  })
})

/**
 * The load warning, wired.
 *
 * `planWarnings` is pure and has its own boundary tests. What those cannot see is whether
 * the number reaches it — and the failure mode is silent: the panel would render no
 * warning on a plan that should have raised one, and look exactly like a plan that was fine.
 */
describe("PlanProposal — practice load", () => {
  beforeEach(() => vi.clearAllMocks())

  it("says nothing when the week has room", () => {
    show({ existingCommitments: 0 })
    expect(screen.queryByText(/commitments a week/i)).toBeNull()
  })

  it("names the total once the plan would overfill the week", () => {
    // The fixture proposes one daily habit — 7 a week — on top of 18 already kept. 25
    // against a limit of 21.
    show({ existingCommitments: 18 })
    expect(screen.getByText(/25 commitments a week/i)).toBeTruthy()
  })
})
