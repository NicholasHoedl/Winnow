import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { NOT_RESTORED, restorableTask } from "./restore"
import { tasks } from "./schema"

// The point of the first test: it compares the restore payload against the SCHEMA, so
// adding a column without touching restore.ts fails here rather than silently losing data
// on undo. That has happened three times in this repo, so a spot-check on today's columns
// wouldn't be enough — the assertion has to be derived from the table itself.

const task = {
  id: "509ee5c5-b1ac-4bfc-a8bf-3c6f327916ea",
  userId: "someone-else",
  listId: "669c4597-6ac9-4e89-8942-1cb2d849a12e",
  seriesId: "9462c6d6-6174-4742-98a1-038d5a47189a",
  occurrenceDate: "2026-07-20",
  goalId: "3d6833e3-6279-4f80-aaa8-f3b6cb4e3d72",
  eventId: null,
  title: "Water the plants",
  notes: "the fiddle-leaf fig especially",
  dueDate: "2026-07-26",
  priority: "high" as const,
  status: "open" as const,
  sortOrder: 4,
  completedAt: null,
  createdAt: new Date("2026-07-20T10:00:00Z"),
  updatedAt: new Date("2026-07-25T10:00:00Z"),
}

describe("restorableTask", () => {
  it("carries every column the table has", () => {
    const payload = restorableTask(task, "me")
    for (const column of Object.keys(getTableColumns(tasks))) {
      if (NOT_RESTORED.has(column)) continue
      expect(payload, `missing column: ${column}`).toHaveProperty(column)
    }
  })

  it("keeps the series link AND its cycle key together", () => {
    // Either one alone is worse than neither: a task carrying seriesId but no
    // occurrenceDate violates the (series_id, occurrence_date) key, and one carrying
    // neither detaches into a one-off that the generator immediately duplicates.
    const payload = restorableTask(task, "me")
    expect(payload.seriesId).toBe(task.seriesId)
    expect(payload.occurrenceDate).toBe("2026-07-20")
  })

  it("keeps the task's manual position", () => {
    expect(restorableTask(task, "me").sortOrder).toBe(4)
  })

  it("preserves the T2 goal and event links", () => {
    const payload = restorableTask(task, "me")
    expect(payload.goalId).toBe(task.goalId)
    expect(payload.eventId).toBeNull()
  })

  it("keeps createdAt but takes userId from the session, not the row", () => {
    const payload = restorableTask(task, "me")
    expect(payload.createdAt).toEqual(task.createdAt)
    expect(payload.userId).toBe("me")
  })

  it("round-trips a completed task without reopening it", () => {
    const done = {
      ...task,
      status: "done" as const,
      completedAt: new Date("2026-07-24T18:00:00Z"),
    }
    const payload = restorableTask(done, "me")
    expect(payload.status).toBe("done")
    expect(payload.completedAt).toEqual(done.completedAt)
  })
})
