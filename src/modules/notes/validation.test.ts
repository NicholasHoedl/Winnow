import { describe, expect, it } from "vitest"

import { noteInputSchema } from "./validation"

describe("noteInputSchema", () => {
  it("accepts a free-form note with only a body", () => {
    const parsed = noteInputSchema.safeParse({ body: "Remember the milk" })
    expect(parsed.success).toBe(true)
  })

  it("accepts a note with only a title", () => {
    expect(noteInputSchema.safeParse({ title: "Groceries" }).success).toBe(true)
  })

  it("accepts a journal entry with a valid date", () => {
    const parsed = noteInputSchema.safeParse({
      body: "Long day.",
      entryDate: "2026-07-22",
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects a note that is entirely empty", () => {
    const parsed = noteInputSchema.safeParse({ title: "", body: "" })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe("Add a title or some text")
    }
  })

  it("rejects whitespace-only content", () => {
    expect(noteInputSchema.safeParse({ body: "   \n  " }).success).toBe(false)
  })

  it("rejects an impossible date", () => {
    expect(
      noteInputSchema.safeParse({ body: "x", entryDate: "2026-02-30" }).success,
    ).toBe(false)
  })

  it("treats an empty date string as absent", () => {
    expect(
      noteInputSchema.safeParse({ body: "x", entryDate: "" }).success,
    ).toBe(true)
  })

  it("rejects a body past the cap", () => {
    expect(
      noteInputSchema.safeParse({ body: "x".repeat(20_001) }).success,
    ).toBe(false)
  })
})
