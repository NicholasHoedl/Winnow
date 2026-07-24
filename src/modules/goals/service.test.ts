import { describe, expect, it } from "vitest"

import { goalProgress } from "./service"

describe("goalProgress", () => {
  it("is 0 with no milestones", () => {
    expect(goalProgress([])).toEqual({ done: 0, total: 0, percent: 0 })
  })

  it("computes done/total/percent", () => {
    expect(
      goalProgress([{ done: true }, { done: false }, { done: true }, { done: false }]),
    ).toEqual({ done: 2, total: 4, percent: 50 })
  })

  it("is 100 when all complete", () => {
    expect(goalProgress([{ done: true }, { done: true }])).toEqual({
      done: 2,
      total: 2,
      percent: 100,
    })
  })
})
