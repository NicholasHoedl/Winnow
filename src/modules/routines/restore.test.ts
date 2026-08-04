import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { NOT_RESTORED, restorableRoutineItem } from "./restore"
import { routineItems } from "./schema"

// Derived from the schema, not from today's column list — see restore.ts.

const item = {
  id: "6b1a2f9c-0d3e-4a5b-8c7d-9e0f1a2b3c4d",
  userId: "someone-else",
  routineId: "1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b",
  title: "Book the kennel",
  notes: "ask for the corner run",
  dueOffsetDays: -7,
  priority: "high" as const,
  listId: null,
  sortOrder: 2,
  createdAt: new Date("2026-07-20T10:00:00Z"),
}

describe("restorableRoutineItem", () => {
  it("carries every column the table has", () => {
    const payload = restorableRoutineItem(item, "me")
    for (const column of Object.keys(getTableColumns(routineItems))) {
      if (NOT_RESTORED.has(column)) continue
      expect(payload, `missing column: ${column}`).toHaveProperty(column)
    }
  })

  it("takes the user from the session, not the row", () => {
    expect(restorableRoutineItem(item, "me").userId).toBe("me")
  })

  it("puts the item back in its position, with its offset intact", () => {
    const payload = restorableRoutineItem(item, "me")
    expect(payload.sortOrder).toBe(2)
    // A negative offset is the interesting one — dropping it would silently turn a
    // "week before" task into one due on the day.
    expect(payload.dueOffsetDays).toBe(-7)
    expect(payload.routineId).toBe(item.routineId)
  })
})
