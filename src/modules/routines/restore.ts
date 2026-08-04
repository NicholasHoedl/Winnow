// Row → insert-payload mapping for the routine-item undo path, kept OUT of actions.ts so
// it can be tested. Pure: no DB access, only the schema's inferred row type.
//
// Same reasoning as `src/modules/goals/restore.ts`: a column omitted from an insert is
// left NULL, which TypeScript accepts, so the only way to stop this list falling behind
// the schema is to derive the check from the table.

import type { routineItems } from "./schema"

/** The full row minus the session-owned column. */
export type RestorableRoutineItem = Omit<
  typeof routineItems.$inferSelect,
  "userId"
>

/**
 * `userId` always comes from the session, never from the client-supplied row.
 * (`updatedAt` is listed for parity with the other modules; `routine_items` has no such
 * column, so the entry simply never matches.)
 */
export const NOT_RESTORED = new Set(["updatedAt", "userId"])

/** Every column of a deleted routine item, ready to re-insert under the session's user. */
export function restorableRoutineItem(
  item: RestorableRoutineItem,
  userId: string,
) {
  return {
    id: item.id,
    userId,
    routineId: item.routineId,
    title: item.title,
    notes: item.notes,
    dueOffsetDays: item.dueOffsetDays,
    priority: item.priority,
    listId: item.listId,
    // Carried so undo puts the item back where it ran in the sequence rather than at the
    // top, which for an ordered template changes what the routine does.
    sortOrder: item.sortOrder,
    createdAt: item.createdAt,
  }
}
