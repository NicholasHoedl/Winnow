import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  generateSchema,
  goalPlanHabitSchema,
  goalPlanPayloadSchema,
  importPayloadSchema,
  importProposalPayloadSchema,
  RECEIPT_IMAGE_MAX_BASE64,
  receiptReadingSchema,
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

// --- Receipt scanning (T33) ---

const ITEM = { name: "Eggs", amount: 3.49, categoryName: "Groceries" }
const RECEIPT = {
  merchant: "Walmart",
  date: "2026-09-11",
  total: 27.18,
  kind: "purchase",
  items: [ITEM],
}
const BASE64 = `${"A".repeat(64)}==`

describe("receiptReadingSchema", () => {
  it("accepts a reading, with null for a date or total it could not see", () => {
    expect(
      receiptReadingSchema.safeParse({ receipts: [RECEIPT] }).success,
    ).toBe(true)
    expect(
      receiptReadingSchema.safeParse({
        receipts: [{ ...RECEIPT, date: null, total: null }],
      }).success,
    ).toBe(true)
    // A photo with nothing on it is an answer, not an error.
    expect(receiptReadingSchema.safeParse({ receipts: [] }).success).toBe(true)
  })

  it("refuses a negative line, a kind it does not know and a date that is not one", () => {
    expect(
      receiptReadingSchema.safeParse({
        receipts: [{ ...RECEIPT, items: [{ ...ITEM, amount: -1 }] }],
      }).success,
    ).toBe(false)
    expect(
      receiptReadingSchema.safeParse({
        receipts: [{ ...RECEIPT, kind: "return" }],
      }).success,
    ).toBe(false)
    expect(
      receiptReadingSchema.safeParse({
        receipts: [{ ...RECEIPT, date: "11/09/2026" }],
      }).success,
    ).toBe(false)
  })

  it("hands the provider a schema with every property required and nothing extra allowed", () => {
    const json = z.toJSONSchema(receiptReadingSchema) as unknown as {
      properties: {
        receipts: {
          items: {
            required: string[]
            additionalProperties: boolean
            properties: { items: { items: { required: string[] } } }
          }
        }
      }
    }
    const receipt = json.properties.receipts.items
    expect(receipt.required).toEqual(
      expect.arrayContaining(["merchant", "date", "total", "kind", "items"]),
    )
    expect(receipt.additionalProperties).toBe(false)
    expect(receipt.properties.items.items.required).toEqual(
      expect.arrayContaining(["name", "amount", "categoryName"]),
    )
  })
})

describe("importProposalPayloadSchema", () => {
  it("reads a proposal stored before scans existed", () => {
    const parsed = importProposalPayloadSchema.safeParse({ rows: [] })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.source).toBeUndefined()
    expect(parsed.data.receipts).toBeUndefined()
  })

  it("keeps the receipts a scan read beside its rows", () => {
    const parsed = importProposalPayloadSchema.safeParse({
      rows: [],
      source: "receipt",
      receipts: [RECEIPT],
    })
    expect(parsed.success).toBe(true)
    if (parsed.success)
      expect(parsed.data.receipts?.[0].merchant).toBe("Walmart")
  })

  it("adds no optional property to what the model is asked for", () => {
    // A strict provider rejects a schema whose `required` does not list every property,
    // so the stored shape and the model-facing shape have to stay two schemas.
    const json = z.toJSONSchema(importPayloadSchema) as unknown as {
      properties: Record<string, unknown>
    }
    expect(Object.keys(json.properties)).toEqual(["rows"])
  })
})

describe("generateSchema, receipt", () => {
  const image = { mediaType: "image/jpeg", data: BASE64 }

  it("takes a base64 image of a known type, with the refinement fields", () => {
    expect(generateSchema.safeParse({ kind: "receipt", image }).success).toBe(
      true,
    )
    expect(
      generateSchema.safeParse({
        kind: "receipt",
        image,
        proposalId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        instruction: "the game is Entertainment",
      }).success,
    ).toBe(true)
  })

  it("refuses a type it does not know, junk that is not base64, and an oversized image", () => {
    expect(
      generateSchema.safeParse({
        kind: "receipt",
        image: { ...image, mediaType: "image/gif" },
      }).success,
    ).toBe(false)
    expect(
      generateSchema.safeParse({
        kind: "receipt",
        image: {
          ...image,
          data: "not base64!! definitely not, with spaces and punctuation.....",
        },
      }).success,
    ).toBe(false)
    expect(
      generateSchema.safeParse({
        kind: "receipt",
        image: { ...image, data: "A".repeat(RECEIPT_IMAGE_MAX_BASE64 + 4) },
      }).success,
    ).toBe(false)
  })
})
