// Pure routine spin-up logic. No DB, no framework — unit-testable directly.

import { addDays } from "@/lib/date"

export type Priority = "low" | "medium" | "high"

/** Only the fields a spin-up reads; callers pass their richer rows. */
export type RoutineItemShape = {
  title: string
  notes: string | null
  dueOffsetDays: number | null
  priority: Priority
  listId: string | null
}

/** One task the run will create. Exactly the columns `runRoutine` inserts. */
export type PlannedTask = {
  title: string
  notes: string | null
  dueDate: string | null
  priority: Priority
  listId: string | null
}

/**
 * The due date an item resolves to for a run anchored at `anchorDate`.
 *
 * A null offset is "no due date", which is not the same as an offset of 0 ("due the day
 * you run it") — hence the nullable column rather than a defaulted one.
 */
export function resolveItemDueDate(
  anchorDate: string,
  offsetDays: number | null,
): string | null {
  if (offsetDays == null) return null
  return addDays(anchorDate, offsetDays)
}

/**
 * What running the routine will create, in the routine's own order.
 *
 * The confirm dialog's count and preview come from this, and so does the insert — so what
 * the user is shown and what lands in the database cannot drift apart.
 */
export function previewRun(
  items: RoutineItemShape[],
  anchorDate: string,
): PlannedTask[] {
  return items.map((item) => ({
    title: item.title,
    notes: item.notes,
    dueDate: resolveItemDueDate(anchorDate, item.dueOffsetDays),
    priority: item.priority,
    listId: item.listId,
  }))
}

/** How an offset reads in the item editor: "Same day", "3 days before", "No due date". */
export function offsetLabel(offsetDays: number | null): string {
  if (offsetDays == null) return "No due date"
  if (offsetDays === 0) return "Same day"
  const days = Math.abs(offsetDays)
  const unit = days === 1 ? "day" : "days"
  return `${days} ${unit} ${offsetDays > 0 ? "after" : "before"}`
}
