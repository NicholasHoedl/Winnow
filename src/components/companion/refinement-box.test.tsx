import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { RefinementBox } from "./refinement-box"

/** The box, and the one control this file is about. */
function show(props: Partial<React.ComponentProps<typeof RefinementBox>> = {}) {
  render(
    <RefinementBox
      kind="goal_plan"
      value="make it shorter"
      onChange={vi.fn()}
      body={{ kind: "goal_plan", proposalId: "p1" }}
      busy={false}
      onRefine={vi.fn()}
      {...props}
    />,
  )
  return { button: screen.getByRole("button", { name: "Revise the proposal" }) }
}

/**
 * Revise is the one AI trigger that showed nothing at all while it worked.
 *
 * It carried `aria-busy` and kept its wand, and `aria-busy` alone renders NOTHING — the same
 * finding the capture bars' `Spinner` swap came out of. Worse than the capture bars, because
 * this wait is a provider round trip rather than a local write: up to `GENERATE_TIMEOUT_MS`,
 * with the previous proposal still on screen looking exactly as it did before the click.
 *
 * `disabled` is right here and wrong there, and the difference is worth saying out loud: a
 * capture bar must stay submittable so a burst of Enters cannot vanish, whereas a second
 * refinement of a proposal that is already being replaced is only a wasted call.
 */
describe("RefinementBox", () => {
  it("swaps the wand for a spinner while a revision is in flight", () => {
    const { button } = show({ busy: true })

    expect(button.querySelector("[data-pending]")).not.toBeNull()
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(button).toBeDisabled()
  })

  it("is a plain, submittable wand when idle", () => {
    const { button } = show()

    expect(button.querySelector("[data-pending]")).toBeNull()
    expect(button).not.toBeDisabled()
  })

  // The pre-existing rule, kept: nothing to build a request from, nothing to press.
  it("stays off when the proposal cannot be refined", () => {
    const { button } = show({ body: null })

    expect(button).toBeDisabled()
  })
})
