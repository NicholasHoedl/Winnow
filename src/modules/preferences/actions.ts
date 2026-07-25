"use server"

import { revalidatePath } from "next/cache"

import { db } from "@/db"
import { type ActionResult, invalid } from "@/lib/action-result"
import { requireUserId } from "@/lib/session"

import { userPreferences } from "./schema"
import {
  notificationPreferencesSchema,
  userPreferencesSchema,
} from "./validation"

export async function setUserPreferences(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = userPreferencesSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .insert(userPreferences)
    .values({ userId, ...parsed.data })
    .onConflictDoUpdate({ target: userPreferences.userId, set: parsed.data })

  // Timezone / week-start / currency / time-format affect rendering app-wide,
  // so revalidate everything under the root layout.
  revalidatePath("/", "layout")
  return { ok: true }
}

/** Writes only the notification columns. Kept separate from setUserPreferences so
 * the two settings sections can't overwrite each other's fields. */
export async function setNotificationPreferences(
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = notificationPreferencesSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .insert(userPreferences)
    .values({ userId, ...parsed.data })
    .onConflictDoUpdate({ target: userPreferences.userId, set: parsed.data })

  // The digest banner is mounted in the app shell.
  revalidatePath("/", "layout")
  return { ok: true }
}
