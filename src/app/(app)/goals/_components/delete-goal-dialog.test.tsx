import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { DeleteGoalDialog } from "./delete-goal-dialog"

/**
 * The practice choice, which is the only state this dialog owns.
 *
 * The three outcomes are proved end-to-end in `e2e/goal-practice.spec.ts`, against the real
 * rows — which is the right level for "does archiving actually set `archived_at`". What is
 * left for this file is what a browser test cannot see cheaply: that the choice RESETS, and
 * that a goal with no practice reports the safe value rather than whatever was last picked.
 *
 * Native radios are what make this testable at all. The base-ui `Select` cannot be driven in
 * jsdom, so a select here would have put the group beyond reach of any component test — one
 * of the two reasons the component uses radios, and the reason this file exists.
 */
describe("DeleteGoalDialog", () => {
  function open(props: Partial<React.ComponentProps<typeof DeleteGoalDialog>>) {
    const onConfirm = vi.fn()
    const view = render(
      <DeleteGoalDialog
        open
        onOpenChange={() => {}}
        title="Lose 15 pounds"
        milestoneCount={5}
        habitCount={4}
        onConfirm={onConfirm}
        {...props}
      />,
    )
    return { onConfirm, view }
  }

  it("names the milestones as a consequence, not a choice", () => {
    open({})
    // Stated in the description and absent from the radios: `milestones.goal_id` is NOT
    // NULL, so there is genuinely nothing to decide.
    expect(
      screen.getByText(/its 5 milestones will be permanently deleted/i),
    ).toBeTruthy()
    expect(screen.queryByRole("radio", { name: /milestone/i })).toBeNull()
  })

  it("defaults to leaving the practice alone", () => {
    const { onConfirm } = open({})
    expect(
      (screen.getByRole("radio", { name: /Leave them/ }) as HTMLInputElement)
        .checked,
    ).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }))
    expect(onConfirm).toHaveBeenCalledWith("leave")
  })

  it("passes the chosen outcome through", () => {
    const { onConfirm } = open({})
    fireEvent.click(screen.getByRole("radio", { name: /Archive them/ }))
    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }))
    expect(onConfirm).toHaveBeenCalledWith("archive")
  })

  it("says nothing about practice when the goal has none", () => {
    open({ habitCount: 0 })
    expect(screen.queryAllByRole("radio")).toHaveLength(0)
  })

  it("does not act on a practice that vanished while it was open", () => {
    const { onConfirm, view } = open({})
    fireEvent.click(screen.getByRole("radio", { name: /Delete them/ }))

    // The last habit is removed underneath — a revalidation lands and the count drops to
    // zero. The radios disappear with it, and the choice they carried has to go too:
    // confirming would otherwise send "delete" about rows that no longer exist.
    //
    // Asserting the count alone would prove nothing here. `practice` starts at "leave", so
    // a component with no guard at all still reports "leave" for a dialog opened with no
    // habits — the only case that can tell the two apart is this one, where a non-default
    // choice is already held.
    view.rerender(
      <DeleteGoalDialog
        open
        onOpenChange={() => {}}
        title="Lose 15 pounds"
        milestoneCount={5}
        habitCount={0}
        onConfirm={onConfirm}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }))
    expect(onConfirm).toHaveBeenCalledWith("leave")
  })

  it("singularises the milestone count", () => {
    open({ milestoneCount: 1 })
    expect(screen.getByText(/its 1 milestone will be/i)).toBeTruthy()
  })

  it("says only that the goal goes when it has no milestones", () => {
    open({ milestoneCount: 0 })
    expect(
      screen.getByText(/^This goal will be permanently deleted\.$/),
    ).toBeTruthy()
  })
})
