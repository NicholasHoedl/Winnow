"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

import { db } from "@/db"
import { users } from "@/db/schema"
import { type ActionResult, invalid } from "@/lib/action-result"
import { requireUserId } from "@/lib/session"
import { unstable_update as updateSession } from "@/lib/auth"
import {
  budgets,
  categories,
  transactionRecurrences,
  transactions,
} from "@/modules/budget/schema"
import { calendars, eventExceptions, events } from "@/modules/calendar/schema"
import { goals, milestones } from "@/modules/goals/schema"
import {
  bodyWeights,
  foods,
  macroTargets,
  mealEntries,
  waterLogs,
} from "@/modules/meals/schema"
import { userPreferences } from "@/modules/preferences/schema"
import { lists, taskRecurrences, tasks } from "@/modules/todos/schema"

import { changePasswordSchema, profileSchema } from "./validation"

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .update(users)
    .set({ displayName: parsed.data.displayName })
    .where(eq(users.id, userId))

  // The name is baked into the JWT at login; refresh it so the sidebar +
  // greeting update without a re-login (see auth.config.ts jwt callback).
  await updateSession({ user: { name: parsed.data.displayName } })
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function changePassword(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) return { ok: false, error: "Account not found." }

  const valid = await bcrypt.compare(
    parsed.data.currentPassword,
    user.passwordHash,
  )
  if (!valid) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: { currentPassword: "Current password is incorrect." },
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12)
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId))
  // JWT sessions aren't tied to the hash, so the current session stays valid —
  // no forced sign-out needed for a single-user app.
  return { ok: true }
}

// Wipe every domain row for the user (keeping the account). FK-safe order:
// children before parents. Wrapped in a transaction so it's all-or-nothing.
export async function clearAllData(): Promise<ActionResult> {
  const userId = await requireUserId()
  await db.transaction(async (tx) => {
    await tx.delete(milestones).where(eq(milestones.userId, userId))
    await tx.delete(goals).where(eq(goals.userId, userId))
    await tx.delete(mealEntries).where(eq(mealEntries.userId, userId))
    await tx.delete(waterLogs).where(eq(waterLogs.userId, userId))
    await tx.delete(bodyWeights).where(eq(bodyWeights.userId, userId))
    await tx.delete(macroTargets).where(eq(macroTargets.userId, userId))
    await tx.delete(foods).where(eq(foods.userId, userId))
    await tx.delete(transactions).where(eq(transactions.userId, userId))
    await tx
      .delete(transactionRecurrences)
      .where(eq(transactionRecurrences.userId, userId))
    await tx.delete(budgets).where(eq(budgets.userId, userId))
    await tx.delete(categories).where(eq(categories.userId, userId))
    await tx.delete(tasks).where(eq(tasks.userId, userId))
    // Recurrence rules were missing here: clearing all data left them behind, and
    // they immediately regenerated tasks (and would now post bills) into the empty
    // account on the next page load.
    await tx.delete(taskRecurrences).where(eq(taskRecurrences.userId, userId))
    await tx.delete(lists).where(eq(lists.userId, userId))
    // Exceptions cascade from events, but delete them explicitly: relying on the
    // cascade means the day someone adds a standalone exception this silently
    // leaks. Calendars were genuinely leaking — nothing deleted them, so "clear
    // all data" wiped every event and left the calendar list fully populated.
    await tx.delete(eventExceptions).where(eq(eventExceptions.userId, userId))
    await tx.delete(events).where(eq(events.userId, userId))
    await tx.delete(calendars).where(eq(calendars.userId, userId))
    await tx.delete(userPreferences).where(eq(userPreferences.userId, userId))
  })
  revalidatePath("/", "layout")
  return { ok: true }
}
