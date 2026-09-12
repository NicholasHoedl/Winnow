import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import type { GoalWithProgress } from "@/modules/goals/queries"
import { DEFAULT_PREFERENCES } from "@/lib/preferences"
import { PreferencesProvider } from "@/components/preferences/preferences-provider"

import { GoalCard } from "./goal-card"

/** Only the fields the card draws — see the note in `transaction-dialog.test.tsx`. */
function goal(over: Partial<GoalWithProgress> = {}): GoalWithProgress {
  return {
    id: "goal-1",
    title: "Run a half marathon",
    notes: null,
    status: "active",
    targetDate: null,
    targetEvent: null,
    milestones: [],
    progress: {
      kind: "numeric",
      current: 5,
      target: 10,
      unit: null,
      percent: 50,
    },
    linkedTasks: [],
    linkedTaskTotal: 0,
    momentum: { moved: 3, stalled: false, windowDays: 14 },
    ...over,
  } as unknown as GoalWithProgress
}

function show(over: Partial<GoalWithProgress> = {}) {
  return render(
    <PreferencesProvider value={DEFAULT_PREFERENCES}>
      <GoalCard goal={goal(over)} practiceCount={0} onOpenDetail={() => {}} />
    </PreferencesProvider>,
  )
}

/**
 * T44 (Pass 10, the goal gradient): a goal that has arrived says so.
 *
 * At target the card was the halfway card with a longer bar — same figure, same momentum
 * word — so the one state worth reading looked like every other. Momentum is about
 * movement and stays right up to the end; the ending is a different fact and takes the
 * same place on the card, because there is nothing left to be moving towards.
 */
describe("GoalCard", () => {
  it("reads the momentum word while the goal is still running", () => {
    show()

    expect(screen.getByText("Moving")).toBeInTheDocument()
    expect(screen.queryByText("Target reached")).not.toBeInTheDocument()
  })

  it("says the target is reached once the figure gets there", () => {
    show({
      progress: {
        kind: "numeric",
        current: 10,
        target: 10,
        unit: null,
        percent: 100,
      },
    })

    expect(screen.getByText("Target reached")).toBeInTheDocument()
    expect(screen.queryByText("Moving")).not.toBeInTheDocument()
  })

  // Overshooting is still arriving — "12 of 10" is 120%, and the card must not go back to
  // reporting movement past its own finish.
  it("says it of an overshot target too", () => {
    show({
      progress: {
        kind: "numeric",
        current: 12,
        target: 10,
        unit: null,
        percent: 120,
      },
    })

    expect(screen.getByText("Target reached")).toBeInTheDocument()
  })

  // A list finished is a different sentence from a figure reached, and the card knows
  // which it is measuring.
  it("says the milestones are done when that is what was counted", () => {
    show({
      progress: { kind: "milestones", done: 4, total: 4, percent: 100 },
      momentum: { moved: 0, stalled: true, windowDays: 14 },
    })

    expect(screen.getByText("All milestones done")).toBeInTheDocument()
    expect(screen.queryByText("Stalled")).not.toBeInTheDocument()
  })

  // Nothing to measure means nothing to have reached. The card says nothing here, which is
  // what it has always done for an untracked goal.
  it("says nothing of a goal with nothing to measure", () => {
    show({ progress: { kind: "none" }, momentum: null })

    expect(screen.queryByText("Target reached")).not.toBeInTheDocument()
    expect(screen.queryByText("Moving")).not.toBeInTheDocument()
  })
})
