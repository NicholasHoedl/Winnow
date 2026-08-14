import { describe, expect, it } from "vitest"

import {
  goalPlanPayloadSchema,
  importPayloadSchema,
  summaryPayloadSchema,
} from "./validation"

/**
 * The bounds on a plan are the design, not a guard rail — so they are worth pinning.
 *
 * This file exists because of a bug that reached a real user: `milestones` carried a
 * `.min(1)`, and a goal whose milestones were already complete made the model answer with
 * an empty list. That is the CORRECT answer — `buildGoalPlanMessages` sends the existing
 * milestone titles specifically so nothing duplicates them — and the schema rejected it.
 *
 * The failure surfaced as `malformed`, which the UI renders as "the provider answered with
 * something this app couldn't read as a plan": no indication that the plan was fine and the
 * app refused it, and no way out except regenerating into the same wall. The schema's own
 * comment had already reasoned this through for `habits` and given it no minimum; the same
 * reasoning simply had not been carried across.
 */
describe("goalPlanPayloadSchema", () => {
  const milestone = { title: "Radicals", dueDate: "2026-09-30" }
  const habit = { title: "Review the deck", period: "week", targetCount: 3 }
  const setupTask = { title: "Buy the deck", dueDate: "2026-08-20" }

  it("accepts a plan with no milestones", () => {
    // Exactly the payload the provider returned for a goal whose five milestones already
    // covered the whole arc: no new checkpoints, but real practice and real setup.
    const result = goalPlanPayloadSchema.safeParse({
      milestones: [],
      habits: [habit],
      setupTasks: [setupTask],
    })
    expect(result.success).toBe(true)
  })

  it("accepts a plan with no habits, which never had a minimum", () => {
    const result = goalPlanPayloadSchema.safeParse({
      milestones: [milestone],
      habits: [],
      setupTasks: [],
    })
    expect(result.success).toBe(true)
  })

  // The caps are the half that IS load-bearing: `setupTasks: max 3` is what makes a
  // twenty-item dated checklist structurally unavailable however the prompt is read.
  it("rejects more than three setup tasks", () => {
    const result = goalPlanPayloadSchema.safeParse({
      milestones: [milestone],
      habits: [],
      setupTasks: [setupTask, setupTask, setupTask, setupTask],
    })
    expect(result.success).toBe(false)
  })

  it("rejects more than twenty milestones", () => {
    const result = goalPlanPayloadSchema.safeParse({
      milestones: Array.from({ length: 21 }, () => milestone),
      habits: [],
      setupTasks: [],
    })
    expect(result.success).toBe(false)
  })
})

/**
 * Import has the same shape of trap the plan schema had, and it was still armed: `rows`
 * carried `.min(1)`, so pasting anything the model finds no transactions in — a header-only
 * export, an unrecognised format, a covering note — produced the correct answer `{rows: []}`
 * and had it rejected as `malformed`. Confirmed against the live provider before the fix.
 */
describe("importPayloadSchema", () => {
  const row = {
    date: "2026-07-14",
    payee: "TESCO",
    description: "",
    amount: 42.1,
    type: "expense",
    categoryName: null,
  }

  it("accepts an extraction that found nothing", () => {
    expect(importPayloadSchema.safeParse({ rows: [] }).success).toBe(true)
  })

  it("still caps the number of rows", () => {
    const result = importPayloadSchema.safeParse({
      rows: Array.from({ length: 101 }, () => row),
    })
    expect(result.success).toBe(false)
  })
})

/**
 * `observations` was an array and the provider would not fill it: `claude-sonnet-5` called
 * the tool but put the whole list into one string, roughly 7 times in 8. Two fixes failed
 * before this one — objects instead of strings, and an explicit "call the tool" line in the
 * prompt — so the array itself was removed. See the note on `summaryPayloadSchema`.
 */
describe("summaryPayloadSchema", () => {
  it("accepts a single observation", () => {
    const result = summaryPayloadSchema.safeParse({
      headline: "A steady week",
      observation1: "You finished more on Wednesday than any other day.",
    })
    expect(result.success).toBe(true)
  })

  it("accepts all four", () => {
    const result = summaryPayloadSchema.safeParse({
      headline: "A steady week",
      observation1: "one",
      observation2: "two",
      observation3: "three",
      observation4: "four",
    })
    expect(result.success).toBe(true)
  })

  // The reason the old array carried `.min(1)`: `summaryReadiness` refuses a thin week
  // before a call is spent, so there is always material and an empty summary is a
  // non-answer rather than a correct one.
  it("requires the first observation", () => {
    const result = summaryPayloadSchema.safeParse({ headline: "A steady week" })
    expect(result.success).toBe(false)
  })

  it("rejects the stringified array the provider used to return", () => {
    const result = summaryPayloadSchema.safeParse({
      headline: "A steady week",
      observations: "You finished more on Wednesday than any other day.",
    })
    expect(result.success).toBe(false)
  })
})
