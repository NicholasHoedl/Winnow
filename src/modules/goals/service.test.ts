import { describe, expect, it } from "vitest"

import { goalMomentum, goalProgress } from "./service"

// The signature changed in T5a: `goalProgress(milestones)` became
// `goalProgress(milestones, goal)` returning a DISCRIMINATED result. The old shape had no
// way to say "there is nothing to measure here" — a goal with no milestones came back as
// `{done: 0, total: 0, percent: 0}`, which the dashboard rail dutifully rendered as a
// literal "0/0" and a 2%-wide bar. `kind: "none"` makes that state unrepresentable as
// progress, so both call sites get it right by construction rather than by remembering.

const none = { targetValue: null, currentValue: null, unit: null }

describe("goalProgress", () => {
  describe("milestones", () => {
    it("counts done over total", () => {
      const progress = goalProgress(
        [{ done: true }, { done: false }, { done: true }, { done: false }],
        none,
      )
      expect(progress).toEqual({
        kind: "milestones",
        done: 2,
        total: 4,
        percent: 50,
      })
    })

    it("is 100 when all complete", () => {
      const progress = goalProgress([{ done: true }, { done: true }], none)
      expect(progress).toMatchObject({ kind: "milestones", percent: 100 })
    })

    it("wins over a numeric target when both are set", () => {
      // Milestones are the more specific statement of intent, and mixing the two into one
      // bar would be arithmetic nobody asked for.
      const progress = goalProgress([{ done: true }], {
        targetValue: 30,
        currentValue: 3,
        unit: "books",
      })
      expect(progress).toMatchObject({ kind: "milestones", percent: 100 })
    })
  })

  describe("numeric", () => {
    it("measures current against target", () => {
      const progress = goalProgress([], {
        targetValue: 30,
        currentValue: 12,
        unit: "books",
      })
      expect(progress).toEqual({
        kind: "numeric",
        current: 12,
        target: 30,
        unit: "books",
        percent: 40,
      })
    })

    it("treats a missing current value as zero progress, not as unmeasured", () => {
      const progress = goalProgress([], {
        targetValue: 30,
        currentValue: null,
        unit: null,
      })
      expect(progress).toMatchObject({
        kind: "numeric",
        current: 0,
        percent: 0,
      })
    })

    it("reports overshoot honestly instead of clamping", () => {
      // Same call T4-S9 made for macros: the number tells the truth and the BAR is what
      // gets clamped, so a screen reader isn't told 100% on a day that hit 120%.
      const progress = goalProgress([], {
        targetValue: 10,
        currentValue: 12,
        unit: "lbs",
      })
      expect(progress).toMatchObject({ kind: "numeric", percent: 120 })
    })

    it("survives a zero or negative target rather than dividing by it", () => {
      // A 0 target is not "instantly complete", it's not a target at all.
      expect(goalProgress([], { ...none, targetValue: 0 })).toEqual({
        kind: "none",
      })
      expect(goalProgress([], { ...none, targetValue: -5 })).toEqual({
        kind: "none",
      })
    })
  })

  describe("none", () => {
    it("says there is nothing to measure", () => {
      expect(goalProgress([], none)).toEqual({ kind: "none" })
    })

    it("is not confused by a unit or a current value with no target", () => {
      expect(
        goalProgress([], { targetValue: null, currentValue: 5, unit: "books" }),
      ).toEqual({ kind: "none" })
    })
  })
})

// America/Chicago is UTC-5 in August, which is what makes the wall-date cases below
// meaningful: an instant can sit on one side of a boundary in UTC and the other side
// locally, and the window has to be in the user's days.
const TZ = "America/Chicago"
const TODAY = "2026-08-04"

// windowDays 7 → the window opens on 2026-07-29 (today plus the six days before it).
function momentum(
  completedAt: (Date | null)[],
  trackableCount = completedAt.length,
) {
  return goalMomentum({
    completedAt,
    trackableCount,
    windowDays: 7,
    today: TODAY,
    timeZone: TZ,
  })
}

describe("goalMomentum", () => {
  it("is null when there is nothing to track", () => {
    // A numeric goal: currentValue is overwritten in place, so there is no history to
    // read. It must not render as stalled — see the doc comment on goalMomentum.
    expect(momentum([], 0)).toBeNull()
  })

  it("counts work finished inside the window", () => {
    const result = momentum([
      new Date("2026-08-04T14:00:00Z"),
      new Date("2026-08-01T14:00:00Z"),
    ])
    expect(result).toEqual({ moved: 2, stalled: false, windowDays: 7 })
  })

  it("reports stalled when the goal has work but none of it moved", () => {
    const result = momentum([new Date("2026-06-01T14:00:00Z")])
    expect(result).toEqual({ moved: 0, stalled: true, windowDays: 7 })
  })

  it("ignores milestones ticked before completedAt existed", () => {
    // T7d added the column; anything ticked earlier has no timestamp and can never get
    // an honest one. Counting those as movement would invent history.
    const result = momentum([null, null, new Date("2026-08-03T14:00:00Z")])
    expect(result?.moved).toBe(1)
  })

  it("uses the local wall date, not the UTC one, at the window's edge", () => {
    // 04:00Z is 23:00 the previous day in Chicago. Its UTC date is inside the window and
    // its local date is not — the local one wins.
    expect(momentum([new Date("2026-07-29T04:00:00Z")])?.moved).toBe(0)
    // One hour later is local midnight on the opening day, so it counts.
    expect(momentum([new Date("2026-07-29T05:00:00Z")])?.moved).toBe(1)
  })

  it("counts today itself", () => {
    expect(momentum([new Date("2026-08-04T23:00:00Z")])?.moved).toBe(1)
  })

  it("ignores a future-dated completion", () => {
    // Impossible from the UI, reachable through account import.
    expect(momentum([new Date("2026-09-01T14:00:00Z")])?.moved).toBe(0)
  })

  it("is stalled, not null, when work exists but every timestamp is missing", () => {
    expect(momentum([null, null])).toEqual({
      moved: 0,
      stalled: true,
      windowDays: 7,
    })
  })
})
