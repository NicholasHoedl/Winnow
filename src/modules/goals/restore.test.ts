import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { NOT_RESTORED, restorableMilestone } from "./restore"
import { milestones } from "./schema"

// Derived from the schema, not from today's column list — see restore.ts for the history.

const milestone = {
  id: "509ee5c5-b1ac-4bfc-a8bf-3c6f327916ea",
  userId: "someone-else",
  goalId: "669c4597-6ac9-4e89-8942-1cb2d849a12e",
  title: "Finish the first draft",
  done: true,
  dueDate: "2026-08-15",
  sortOrder: 3,
  createdAt: new Date("2026-07-20T10:00:00Z"),
}

describe("restorableMilestone", () => {
  it("carries every column the table has", () => {
    const payload = restorableMilestone(milestone, "me")
    for (const column of Object.keys(getTableColumns(milestones))) {
      if (NOT_RESTORED.has(column)) continue
      expect(payload, `missing column: ${column}`).toHaveProperty(column)
    }
  })

  it("puts the milestone back in its position, not at the top", () => {
    const payload = restorableMilestone(milestone, "me")
    expect(payload.sortOrder).toBe(3)
    expect(payload.dueDate).toBe("2026-08-15")
    expect(payload.goalId).toBe(milestone.goalId)
  })

  it("keeps a completed milestone completed, under the session user", () => {
    const payload = restorableMilestone(milestone, "me")
    expect(payload.done).toBe(true)
    expect(payload.createdAt).toEqual(milestone.createdAt)
    expect(payload.userId).toBe("me")
  })
})
