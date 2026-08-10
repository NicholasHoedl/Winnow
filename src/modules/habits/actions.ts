"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import {
  type ActionFailure,
  type ActionResult,
  invalid,
} from "@/lib/action-result"
import { dayDiff, todayInZone } from "@/lib/date"
import { requireUserId } from "@/lib/session"
import { goals } from "@/modules/goals/schema"
import { getUserPreferences } from "@/modules/preferences/queries"

import { habitEntries, habits } from "./schema"
import { habitInputSchema, logEntrySchema } from "./validation"

/** See goals/actions.ts — every id crossing an RPC boundary is parsed, not annotated. */
const idSchema = z.string().uuid()

/**
 * Habits render on their own page and in the /activity rail.
 *
 * Deliberately NOT `revalidateHubs()`: no hub shows a habit in T12a, and revalidating a
 * page that cannot have changed is a claim about coupling that is not true yet. T12b adds
 * it, when goal momentum starts reading them.
 */
function revalidateHabitViews() {
  revalidatePath("/activity/habits")
  revalidatePath("/activity")
}

/**
 * Prove a client-supplied goal id belongs to the caller before writing it.
 *
 * The same hole `checkTaskLinks` exists to close, for the same reason: the foreign key is
 * satisfied perfectly well by a stranger's goal, and the habit row would still be keyed to
 * YOUR user — so it renders as a silently broken link rather than an error. Postgres has no
 * opinion about the pair matching.
 */
async function checkGoal(
  userId: string,
  goalId: string | null,
): Promise<string | null> {
  if (!goalId) return null
  const owned = await db.query.goals.findFirst({
    where: and(eq(goals.id, goalId), eq(goals.userId, userId)),
    columns: { id: true },
  })
  return owned ? null : "Unknown goal."
}

/** Ownership, and the guard that turns a bad id into a message instead of an FK error. */
async function ownsHabit(userId: string, habitId: string): Promise<boolean> {
  const owned = await db.query.habits.findFirst({
    where: and(eq(habits.id, habitId), eq(habits.userId, userId)),
    columns: { id: true },
  })
  return !!owned
}

/**
 * Carries the new habit's id, for the same reason `createRoutine` does: the companion will
 * apply a generated plan by creating each habit and then referring to it (T12c).
 */
export type CreateHabitResult = { ok: true; id: string } | ActionFailure

export async function createHabit(input: unknown): Promise<CreateHabitResult> {
  const userId = await requireUserId()
  const parsed = habitInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const goalError = await checkGoal(userId, parsed.data.goalId)
  if (goalError) return { ok: false, error: goalError }

  const { timeZone } = await getUserPreferences()
  // Appended, mirroring `addRoutineItem`: create order is display order even though this
  // tranche ships no reorder UI, so adding one later needs no backfill.
  const [last] = await db
    .select({ sortOrder: habits.sortOrder })
    .from(habits)
    .where(eq(habits.userId, userId))
    .orderBy(desc(habits.sortOrder))
    .limit(1)

  const [created] = await db
    .insert(habits)
    .values({
      userId,
      title: parsed.data.title,
      goalId: parsed.data.goalId,
      period: parsed.data.period,
      targetCount: parsed.data.targetCount,
      // A habit starts when you make it. Not client-supplied — see validation.ts.
      startDate: todayInZone(new Date(), timeZone),
      sortOrder: (last?.sortOrder ?? -1) + 1,
    })
    .returning({ id: habits.id })

  revalidateHabitViews()
  return { ok: true, id: created.id }
}

export async function updateHabit(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = habitInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const goalError = await checkGoal(userId, parsed.data.goalId)
  if (goalError) return { ok: false, error: goalError }

  // `startDate` is not updated. Moving it would re-bucket every period behind the habit and
  // silently rewrite its streak — the one thing ADR-0014 promises only happens when you
  // change the CADENCE, which is at least a visible edit.
  await db
    .update(habits)
    .set({
      title: parsed.data.title,
      goalId: parsed.data.goalId,
      period: parsed.data.period,
      targetCount: parsed.data.targetCount,
    })
    .where(and(eq(habits.id, parsedId.data), eq(habits.userId, userId)))

  revalidateHabitViews()
  return { ok: true }
}

/** Retire a habit without losing what it recorded. Reversible, unlike `deleteHabit`. */
export async function archiveHabit(id: unknown): Promise<ActionResult> {
  return setArchived(id, new Date())
}

export async function unarchiveHabit(id: unknown): Promise<ActionResult> {
  return setArchived(id, null)
}

async function setArchived(
  id: unknown,
  archivedAt: Date | null,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .update(habits)
    .set({ archivedAt })
    .where(and(eq(habits.id, parsed.data), eq(habits.userId, userId)))

  revalidateHabitViews()
  return { ok: true }
}

/**
 * Hard delete, entries and all.
 *
 * There is no undo, and that is why the UI puts a `ConfirmDialog` in front of it — the same
 * call `deleteRoutine` makes. `archiveHabit` is the reversible option and the one the menu
 * offers first; this one exists because "I never want to see this again" is a real thing to
 * want, and because every e2e spec has to be able to remove its own fixtures.
 */
export async function deleteHabit(id: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .delete(habits)
    .where(and(eq(habits.id, parsed.data), eq(habits.userId, userId)))

  revalidateHabitViews()
  return { ok: true }
}

/**
 * The `+1`. Carries the new entry's id so the undo can delete exactly that row.
 *
 * That precision matters more here than elsewhere: there is no unique constraint on
 * (habit_id, on_date), so "delete today's entry for this habit" could take the wrong one of
 * three. Undo-of-create is a delete, which is also why this module has no `restore.ts` —
 * nothing is ever re-inserted, so there is no column map that could silently fall behind
 * the schema.
 */
export type LogEntryResult = { ok: true; entryId: string } | ActionFailure

export async function logEntry(
  habitId: unknown,
  input?: unknown,
): Promise<LogEntryResult> {
  const userId = await requireUserId()
  const parsedId = idSchema.safeParse(habitId)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsed = logEntrySchema.safeParse(input ?? {})
  if (!parsed.success) return invalid(parsed.error)

  if (!(await ownsHabit(userId, parsedId.data))) {
    return { ok: false, error: "Unknown habit." }
  }

  const { timeZone } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const onDate = parsed.data.onDate ?? today
  // `isValidDateString` is happy with the year 3000, and a row outside every window the app
  // queries would be invisible, un-deletable through the UI, and still in the backup.
  if (Math.abs(dayDiff(today, onDate)) > 370) {
    return { ok: false, error: "That date is too far away." }
  }

  const [created] = await db
    .insert(habitEntries)
    .values({ userId, habitId: parsedId.data, onDate })
    .returning({ id: habitEntries.id })

  revalidateHabitViews()
  return { ok: true, entryId: created.id }
}

/** Undo for `logEntry`, and the only way an entry is ever removed on its own. */
export async function deleteEntry(entryId: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = idSchema.safeParse(entryId)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .delete(habitEntries)
    .where(
      and(eq(habitEntries.id, parsed.data), eq(habitEntries.userId, userId)),
    )

  revalidateHabitViews()
  return { ok: true }
}
