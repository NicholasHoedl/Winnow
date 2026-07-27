import { describe, expect, it } from "vitest"

import { restoreTaskSchema } from "./validation"

// `restoreTask` is a Server Action, so its parameter type guards nothing at runtime — the
// browser can post anything. T5a-S1 added this schema, and the risk it carries is the
// opposite of the usual one: a schema that is too STRICT rejects a legitimate row and
// breaks undo, and it would do so silently (an error toast), passing both typecheck and
// every existing test. So the first case here is a realistic row exactly as
// `.returning()` hands it back and React serializes it across the RSC boundary.

const row = {
  id: "509ee5c5-b1ac-4bfc-a8bf-3c6f327916ea",
  listId: null,
  seriesId: null,
  occurrenceDate: null,
  goalId: null,
  eventId: null,
  title: "Water the plants",
  notes: null,
  dueDate: "2026-07-26",
  priority: "medium",
  status: "open",
  sortOrder: 0,
  completedAt: null,
  createdAt: new Date("2026-07-20T10:00:00Z"),
}

describe("restoreTaskSchema", () => {
  it("accepts a plain one-off task row", () => {
    expect(restoreTaskSchema.safeParse(row).success).toBe(true)
  })

  it("accepts a completed recurring instance with every link populated", () => {
    const full = {
      ...row,
      listId: "669c4597-6ac9-4e89-8942-1cb2d849a12e",
      seriesId: "9462c6d6-6174-4742-98a1-038d5a47189a",
      occurrenceDate: "2026-07-20",
      goalId: "3d6833e3-6279-4f80-aaa8-f3b6cb4e3d72",
      eventId: "15b14ff4-bcd3-4aeb-8390-8d237ed85e20",
      notes: "the fiddle-leaf fig especially",
      status: "done",
      completedAt: new Date("2026-07-24T18:00:00Z"),
    }
    const parsed = restoreTaskSchema.parse(full)
    expect(parsed.seriesId).toBe(full.seriesId)
    expect(parsed.completedAt).toBeInstanceOf(Date)
  })

  it("accepts dates as ISO strings too", () => {
    // Belt and braces on the serialization boundary: z.coerce.date() must handle both.
    const parsed = restoreTaskSchema.parse({
      ...row,
      createdAt: "2026-07-20T10:00:00.000Z",
    })
    expect(parsed.createdAt).toBeInstanceOf(Date)
  })

  it("drops a client-supplied userId instead of carrying it through", () => {
    const parsed = restoreTaskSchema.parse({ ...row, userId: "someone-else" })
    expect(parsed).not.toHaveProperty("userId")
  })

  it("REJECTS a payload with a column missing", () => {
    // An absent key would arrive as undefined, drizzle would skip the column, and the
    // restored row would come back with a silent NULL — the data loss restore.ts exists
    // to prevent. Nullable, but never optional.
    const { goalId, ...missing } = row
    void goalId
    expect(restoreTaskSchema.safeParse(missing).success).toBe(false)
  })

  it("rejects a bad date or enum rather than letting Postgres reject it", () => {
    expect(
      restoreTaskSchema.safeParse({ ...row, dueDate: "2026-02-30" }).success,
    ).toBe(false)
    expect(
      restoreTaskSchema.safeParse({ ...row, status: "skipped" }).success,
    ).toBe(false)
  })
})
