import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { NOT_RESTORED, restorableNote } from "./restore"
import { notes } from "./schema"

// Derived from the schema, not from today's column list — see restore.ts.

const note = {
  id: "0d6e0b8c-9c2e-4f4a-9a5c-2b7a1f6f9e11",
  userId: "someone-else",
  title: "Trip notes",
  body: "Pack the charger.",
  entryDate: "2026-07-22",
  pinned: true,
  createdAt: new Date("2026-07-20T10:00:00Z"),
  updatedAt: new Date("2026-07-21T18:30:00Z"),
}

describe("restorableNote", () => {
  it("carries every column the table has", () => {
    const payload = restorableNote(note, "me")
    for (const column of Object.keys(getTableColumns(notes))) {
      if (NOT_RESTORED.has(column)) continue
      expect(payload, `missing column: ${column}`).toHaveProperty(column)
    }
  })

  it("takes the user from the session, not the row", () => {
    expect(restorableNote(note, "me").userId).toBe("me")
  })

  it("preserves the original timestamps so undo restores list position", () => {
    const payload = restorableNote(note, "me")
    expect(payload.createdAt).toEqual(note.createdAt)
    expect(payload.updatedAt).toEqual(note.updatedAt)
  })

  it("keeps the journal anchor and the pin flag", () => {
    const payload = restorableNote(note, "me")
    expect(payload.entryDate).toBe("2026-07-22")
    expect(payload.pinned).toBe(true)
  })
})
