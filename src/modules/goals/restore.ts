// Row → insert-payload mapping for the milestone undo path, kept OUT of actions.ts so it
// can be tested. Pure: no DB access, only the schema's inferred row type.
//
// Same reasoning as `src/modules/todos/restore.ts` and `src/modules/meals/restore.ts`: a
// column omitted from an insert is left NULL, which TypeScript accepts, so the only way to
// stop the list falling behind the schema is to derive the check from the table. T5a adds
// `dueDate` to milestones, which would otherwise vanish on undo.

import type { milestones } from "./schema"

/**
 * The full row minus the session-owned column — see todos/restore.ts for why.
 * Named distinctly from `MilestoneRow` in queries.ts, which is the whole row and is what
 * `deleteMilestone` hands back.
 */
export type RestorableMilestone = Omit<typeof milestones.$inferSelect, "userId">

/**
 * `userId` always comes from the session, never from the client-supplied row.
 * (`updatedAt` is listed for parity with the other modules; `milestones` has no such
 * column, so the entry simply never matches.)
 */
export const NOT_RESTORED = new Set(["updatedAt", "userId"])

/** Every column of a deleted milestone, ready to re-insert under the session's user. */
export function restorableMilestone(
  milestone: RestorableMilestone,
  userId: string,
) {
  return {
    id: milestone.id,
    userId,
    goalId: milestone.goalId,
    title: milestone.title,
    done: milestone.done,
    dueDate: milestone.dueDate,
    // Carried so undo puts the milestone back where it was in the list rather than at
    // position 0 — which, before T5a gave addMilestone a real writer, was every row.
    sortOrder: milestone.sortOrder,
    // Restoring a ticked milestone without its timestamp would silently drop it out of
    // the weekly review it had already appeared in.
    completedAt: milestone.completedAt,
    createdAt: milestone.createdAt,
  }
}
