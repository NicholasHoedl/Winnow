import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  goalPlanHabitSchema,
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

describe("goalPlanHabitSchema — the measured variant", () => {
  const base = { title: "Learn kanji", period: "day", targetCount: 1 }

  it("takes an amount and a unit", () => {
    const parsed = goalPlanHabitSchema.parse({
      ...base,
      targetAmount: 20,
      unit: "kanji",
    })
    expect(parsed).toMatchObject({ targetAmount: 20, unit: "kanji" })
  })

  // The compatibility case, and the reason both fields carry `.default(null)`. A plan
  // generated before these existed is sitting in `ai_proposals` as jsonb with neither key;
  // without the default it would parse as `malformed` and the user could not even discard
  // it, because the renderer that offers Discard never renders.
  it("still parses a payload written before these fields existed", () => {
    const parsed = goalPlanHabitSchema.parse(base)
    expect(parsed.targetAmount).toBeNull()
    expect(parsed.unit).toBeNull()
  })

  // Deliberately ACCEPTED here rather than refused. The both-or-neither rule cannot live in
  // this schema — it is converted by `z.toJSONSchema` for the provider, and Zod will not
  // convert a refinement — so `proposedQuota` resolves a half-stated pair to a session
  // habit instead. Rejecting it here would fail the whole plan as malformed.
  it("accepts a half-stated pair, which proposedQuota resolves", () => {
    expect(
      goalPlanHabitSchema.safeParse({ ...base, targetAmount: 20, unit: null })
        .success,
    ).toBe(true)
    expect(
      goalPlanHabitSchema.safeParse({
        ...base,
        targetAmount: null,
        unit: "kanji",
      }).success,
    ).toBe(true)
  })

  it("still refuses a nonsense amount or an essay for a unit", () => {
    expect(
      goalPlanHabitSchema.safeParse({ ...base, targetAmount: 0, unit: "kanji" })
        .success,
    ).toBe(false)
    expect(
      goalPlanHabitSchema.safeParse({
        ...base,
        targetAmount: -5,
        unit: "kanji",
      }).success,
    ).toBe(false)
    expect(
      goalPlanHabitSchema.safeParse({
        ...base,
        targetAmount: 20,
        unit: "x".repeat(21),
      }).success,
    ).toBe(false)
  })
})

// The tripwire that matters most for this change: the schema is sent to the provider, and
// Zod refuses to convert a transform or a refinement. If either ever gets added to the plan
// schemas, every plan request breaks — not one field.
describe("the plan schema survives JSON Schema conversion", () => {
  it("converts, with both new fields required and nullable", () => {
    // Typed rather than `any`: the point of this test is the SHAPE, so naming it is the
    // assertion doing half its own work.
    const json = z.toJSONSchema(goalPlanPayloadSchema) as unknown as {
      properties: {
        habits: {
          items: { required: string[]; additionalProperties: boolean }
        }
      }
    }
    const habit = json.properties.habits.items
    expect(habit.required).toContain("targetAmount")
    expect(habit.required).toContain("unit")
    expect(habit.additionalProperties).toBe(false)
  })
})
