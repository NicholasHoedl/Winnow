import { describe, expect, it } from "vitest"

import {
  type RoutineItemShape,
  offsetLabel,
  previewRun,
  resolveItemDueDate,
} from "./service"

function item(over: Partial<RoutineItemShape> = {}): RoutineItemShape {
  return {
    title: "Pack",
    notes: null,
    dueOffsetDays: 0,
    priority: "medium",
    listId: null,
    ...over,
  }
}

describe("resolveItemDueDate", () => {
  it("treats 0 as the anchor day itself", () => {
    expect(resolveItemDueDate("2026-07-22", 0)).toBe("2026-07-22")
  })

  it("moves forward for a positive offset", () => {
    expect(resolveItemDueDate("2026-07-22", 3)).toBe("2026-07-25")
  })

  // The reason the column is signed: "book the kennel" is a week BEFORE the trip.
  it("moves back for a negative offset", () => {
    expect(resolveItemDueDate("2026-07-22", -7)).toBe("2026-07-15")
  })

  // Distinct from 0 — a null offset means the task has no deadline at all.
  it("returns null for a null offset", () => {
    expect(resolveItemDueDate("2026-07-22", null)).toBeNull()
  })

  it("crosses month and year boundaries", () => {
    expect(resolveItemDueDate("2026-07-31", 1)).toBe("2026-08-01")
    expect(resolveItemDueDate("2026-01-01", -1)).toBe("2025-12-31")
  })
})

describe("previewRun", () => {
  it("keeps the routine's order and resolves each due date", () => {
    const planned = previewRun(
      [
        item({ title: "Book kennel", dueOffsetDays: -7 }),
        item({ title: "Pack", dueOffsetDays: -1 }),
        item({ title: "Leave", dueOffsetDays: 0 }),
        item({ title: "Unpack", dueOffsetDays: null }),
      ],
      "2026-07-22",
    )
    expect(planned.map((p) => [p.title, p.dueDate])).toEqual([
      ["Book kennel", "2026-07-15"],
      ["Pack", "2026-07-21"],
      ["Leave", "2026-07-22"],
      ["Unpack", null],
    ])
  })

  it("carries priority, notes and list through untouched", () => {
    const [planned] = previewRun(
      [
        item({
          notes: "passport",
          priority: "high",
          listId: "8f14e45f-ceea-467a-9b2a-3c1e3b5a1111",
        }),
      ],
      "2026-07-22",
    )
    expect(planned.notes).toBe("passport")
    expect(planned.priority).toBe("high")
    expect(planned.listId).toBe("8f14e45f-ceea-467a-9b2a-3c1e3b5a1111")
  })

  it("plans nothing for an empty routine", () => {
    expect(previewRun([], "2026-07-22")).toEqual([])
  })
})

describe("offsetLabel", () => {
  it("names each direction, and singularises one day", () => {
    expect(offsetLabel(null)).toBe("No due date")
    expect(offsetLabel(0)).toBe("Same day")
    expect(offsetLabel(1)).toBe("1 day after")
    expect(offsetLabel(3)).toBe("3 days after")
    expect(offsetLabel(-1)).toBe("1 day before")
    expect(offsetLabel(-7)).toBe("7 days before")
  })
})
