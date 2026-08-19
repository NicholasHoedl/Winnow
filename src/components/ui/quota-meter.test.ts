import { describe, expect, it } from "vitest"

import { MAX_SEGMENTS, quotaSegments } from "./quota-meter"

describe("quotaSegments", () => {
  it("draws one box per required log, none of them filled at zero", () => {
    expect(quotaSegments(0, 3)).toEqual({
      total: 3,
      filled: 0,
      surplus: 0,
      segmented: true,
    })
  })

  it("fills one box per log made", () => {
    expect(quotaSegments(2, 3)).toMatchObject({ total: 3, filled: 2 })
  })

  it("fills every box exactly at the target, with nothing spare", () => {
    expect(quotaSegments(3, 3)).toMatchObject({
      total: 3,
      filled: 3,
      surplus: 0,
    })
  })

  it("GROWS past the target rather than clamping to it", () => {
    // The case `habits.spec.ts` covers as "3/2 this week". Clamping would draw 3-of-2
    // identically to 2-of-2, which throws away the only interesting thing about it — the
    // whole reason a habit is a quota and not a checkbox (ADR-0014).
    expect(quotaSegments(3, 2)).toEqual({
      total: 3,
      filled: 3,
      surplus: 1,
      segmented: true,
    })
  })

  it("counts every log beyond the target as surplus", () => {
    expect(quotaSegments(6, 2)).toMatchObject({ total: 6, surplus: 4 })
  })

  it("draws nothing for a target of zero and no logs", () => {
    // `segmented: false` rather than an empty row of boxes — `total: 0` would render as a
    // gap, and dividing by a zero target for the fallback bar is guarded in the component.
    expect(quotaSegments(0, 0)).toMatchObject({ total: 0, segmented: false })
  })

  it("still draws logs made against a target of zero", () => {
    expect(quotaSegments(2, 0)).toMatchObject({
      total: 2,
      filled: 2,
      surplus: 2,
    })
  })

  it("stays segmented right up to the limit and gives up past it", () => {
    // The boundary in both directions. A 30-a-month habit is the real case: thirty slivers
    // are not countable at a glance, which is the entire argument for boxes over a bar.
    expect(quotaSegments(0, MAX_SEGMENTS).segmented).toBe(true)
    expect(quotaSegments(0, MAX_SEGMENTS + 1).segmented).toBe(false)
  })

  it("gives up when an OVERSHOOT pushes it past the limit", () => {
    // The total is what has to be drawn, not the target — a modest target blown well past
    // still ends up with too many boxes.
    expect(quotaSegments(MAX_SEGMENTS + 5, 3).segmented).toBe(false)
  })

  it("ignores negatives and fractions rather than rendering them", () => {
    // Neither is reachable through the UI, but `now.done` is a count from a query and
    // `target` is a user-entered integer column — a half-filled box would be a strange way
    // to find out something upstream had gone wrong.
    expect(quotaSegments(-4, 3)).toMatchObject({ filled: 0, surplus: 0 })
    expect(quotaSegments(2.7, 3.9)).toMatchObject({ total: 3, filled: 2 })
  })
})

describe("quotaSegments — measured", () => {
  // Not a size threshold like MAX_SEGMENTS. A measured quota has nothing discrete to draw
  // a box per, so it never segments however small its target is.
  it("never segments, even at a target squares would fit", () => {
    expect(quotaSegments(1.5, 3, true).segmented).toBe(false)
    expect(quotaSegments(0, 1, true).segmented).toBe(false)
  })

  // The bug this flag exists to stop: 1.5 L of a 3 L day floored to one filled box of
  // three, reporting half a litre as nothing and reading as a session count.
  it("keeps the fraction a session quota would floor away", () => {
    expect(quotaSegments(1.5, 3, true)).toMatchObject({ total: 3, filled: 1.5 })
    expect(quotaSegments(1.5, 3, false)).toMatchObject({ total: 3, filled: 1 })
  })

  it("still grows past the target so an overshoot is visible", () => {
    expect(quotaSegments(14.5, 10, true)).toMatchObject({
      total: 14.5,
      surplus: 4.5,
    })
  })

  it("draws nothing for a target of zero rather than dividing by it", () => {
    expect(quotaSegments(0, 0, true)).toMatchObject({ total: 0, surplus: 0 })
  })
})
