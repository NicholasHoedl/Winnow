// Row → insert-payload mapping for the undo path, kept OUT of actions.ts so it can be
// tested. Pure: no DB access, only the schema's inferred row types.
//
// Why this exists as its own module: "re-insert the row you just deleted" has silently
// dropped a newly added column three times in this codebase — `842f420` for tasks
// themselves, T3-S11 for transactions, T4-S11 for the account data tools. TypeScript
// can't catch it: a column omitted from an insert is simply left NULL, which is valid.
// So the column list is exported and a test asserts it covers every column in the table,
// which fails the moment someone adds one and forgets this file. T5a adds `sortOrder`,
// which is exactly the kind of column whose loss on undo nobody would notice.

import type { tasks } from "./schema"

/**
 * The input is the full row MINUS the columns below, so an action can hand this function
 * a Zod-parsed undo payload directly — the payload arrives from the browser, so its
 * schema must not accept a `userId` at all.
 */
export type RestorableTask = Omit<
  typeof tasks.$inferSelect,
  "userId" | "updatedAt"
>

/**
 * Columns deliberately NOT restored, and why:
 * - `updatedAt` has `$onUpdate`, so it re-stamps itself; carrying the old value would
 *   claim the row hasn't been touched since before it was deleted.
 * - `userId` always comes from the session, never from the client-supplied row.
 */
export const NOT_RESTORED = new Set(["updatedAt", "userId"])

/** Every column of a deleted task, ready to re-insert under the session's user. */
export function restorableTask(task: RestorableTask, userId: string) {
  return {
    id: task.id,
    userId,
    listId: task.listId,
    // The series link and its cycle key. Without both, undoing a recurring instance
    // detaches it into an ordinary one-off and the generator immediately makes another.
    seriesId: task.seriesId,
    occurrenceDate: task.occurrenceDate,
    // The T2 cross-module links.
    goalId: task.goalId,
    eventId: task.eventId,
    title: task.title,
    notes: task.notes,
    dueDate: task.dueDate,
    priority: task.priority,
    status: task.status,
    // Manual position. Losing this on undo would drop the task back to the top of its
    // section — the quiet kind of loss this whole module exists to prevent.
    sortOrder: task.sortOrder,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
  }
}
