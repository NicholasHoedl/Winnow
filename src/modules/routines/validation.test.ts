import { describe, expect, it } from "vitest"

import {
  routineInputSchema,
  routineItemInputSchema,
  runRoutineSchema,
} from "./validation"

describe("routineInputSchema", () => {
  it("accepts a named routine with and without a description", () => {
    expect(routineInputSchema.safeParse({ name: "Trip prep" }).success).toBe(
      true,
    )
    expect(
      routineInputSchema.safeParse({ name: "Trip prep", description: "" })
        .success,
    ).toBe(true)
  })

  it("requires a name", () => {
    expect(routineInputSchema.safeParse({ name: "   " }).success).toBe(false)
  })
})

describe("routineItemInputSchema", () => {
  it("accepts an item with no offset at all", () => {
    expect(routineItemInputSchema.safeParse({ title: "Unpack" }).success).toBe(
      true,
    )
  })

  it("accepts zero, positive and negative offsets", () => {
    for (const dueOffsetDays of [0, 3, -7]) {
      expect(
        routineItemInputSchema.safeParse({ title: "Pack", dueOffsetDays })
          .success,
      ).toBe(true)
    }
  })

  it("distinguishes an explicit null from an absent offset", () => {
    const parsed = routineItemInputSchema.safeParse({
      title: "Pack",
      dueOffsetDays: null,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.dueOffsetDays).toBeNull()
  })

  it("rejects a fractional offset", () => {
    expect(
      routineItemInputSchema.safeParse({ title: "Pack", dueOffsetDays: 1.5 })
        .success,
    ).toBe(false)
  })

  it("rejects an offset beyond a year in either direction", () => {
    expect(
      routineItemInputSchema.safeParse({ title: "Pack", dueOffsetDays: 400 })
        .success,
    ).toBe(false)
    expect(
      routineItemInputSchema.safeParse({ title: "Pack", dueOffsetDays: -400 })
        .success,
    ).toBe(false)
  })

  it("rejects a non-uuid list id", () => {
    expect(
      routineItemInputSchema.safeParse({ title: "Pack", listId: "not-a-uuid" })
        .success,
    ).toBe(false)
  })
})

describe("runRoutineSchema", () => {
  it("takes a real calendar date", () => {
    expect(
      runRoutineSchema.safeParse({ anchorDate: "2026-07-22" }).success,
    ).toBe(true)
  })

  it("rejects an impossible one", () => {
    expect(
      runRoutineSchema.safeParse({ anchorDate: "2026-02-30" }).success,
    ).toBe(false)
    expect(runRoutineSchema.safeParse({ anchorDate: "" }).success).toBe(false)
  })
})
