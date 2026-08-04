import { describe, expect, it } from "vitest"

import { restoreMilestoneSchema } from "./validation"

// See todos/validation.test.ts for the reasoning. The risk being covered is a schema that
// is too strict and silently breaks undo, so the first case is a realistic row.

const row = {
  id: "509ee5c5-b1ac-4bfc-a8bf-3c6f327916ea",
  goalId: "669c4597-6ac9-4e89-8942-1cb2d849a12e",
  title: "Finish the first draft",
  done: false,
  dueDate: null,
  sortOrder: 0,
  // Added in T7d. Null here because this row isn't ticked — `deleteMilestone` returns
  // every column, so a real payload always carries the key even when it has no value.
  completedAt: null,
  createdAt: new Date("2026-07-20T10:00:00Z"),
}

describe("restoreMilestoneSchema", () => {
  it("accepts a realistic milestone row", () => {
    expect(restoreMilestoneSchema.safeParse(row).success).toBe(true)
  })

  it("accepts a completed milestone deeper in the list", () => {
    const parsed = restoreMilestoneSchema.parse({
      ...row,
      done: true,
      sortOrder: 7,
    })
    expect(parsed.done).toBe(true)
    expect(parsed.sortOrder).toBe(7)
  })

  it("drops a client-supplied userId instead of carrying it through", () => {
    const parsed = restoreMilestoneSchema.parse({ ...row, userId: "someone" })
    expect(parsed).not.toHaveProperty("userId")
  })

  it("round-trips the completion timestamp on a ticked milestone", () => {
    // Undo that dropped this would restore the milestone as "done" with no date, and it
    // would vanish from the weekly review it had already been counted in.
    const completedAt = new Date("2026-07-22T09:15:00Z")
    const parsed = restoreMilestoneSchema.parse({
      ...row,
      done: true,
      completedAt,
    })
    expect(parsed.completedAt).toEqual(completedAt)
  })

  it("REJECTS a payload with sortOrder missing", () => {
    // Undo would otherwise put the milestone back at the DB default of 0 — at the top of
    // the list rather than where it was.
    const { sortOrder, ...missing } = row
    void sortOrder
    expect(restoreMilestoneSchema.safeParse(missing).success).toBe(false)
  })
})
