// Row → insert-payload mapping for the note undo path, kept OUT of actions.ts so it can
// be tested. Pure: no DB access, only the schema's inferred row type.
//
// Same reasoning as `src/modules/goals/restore.ts`: a column omitted from an insert is
// left NULL, which TypeScript accepts, so the only way to stop this list falling behind
// the schema is to derive the check from the table.

import type { notes } from "./schema"

/** The full row minus the session-owned column. */
export type RestorableNote = Omit<typeof notes.$inferSelect, "userId">

/**
 * `userId` always comes from the session, never from the client-supplied row.
 *
 * Unlike the other modules', this set does NOT list `updatedAt`. Notes are listed
 * most-recently-updated first, so letting the insert re-stamp it would drop a restored
 * note at the top of the list instead of back where it was — undo should return the
 * previous state, not manufacture a new-looking note.
 */
export const NOT_RESTORED = new Set(["userId"])

/** Every column of a deleted note, ready to re-insert under the session's user. */
export function restorableNote(note: RestorableNote, userId: string) {
  return {
    id: note.id,
    userId,
    title: note.title,
    body: note.body,
    entryDate: note.entryDate,
    pinned: note.pinned,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
}
