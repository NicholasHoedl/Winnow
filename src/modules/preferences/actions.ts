"use server"

import { revalidatePath } from "next/cache"

import { db } from "@/db"
import { type ActionResult, invalid } from "@/lib/action-result"
import { requireUserId } from "@/lib/session"

import { userPreferences } from "./schema"
import {
  appearancePreferencesSchema,
  notificationPreferencesSchema,
  userPreferencesSchema,
} from "./validation"

export async function setUserPreferences(
  input: unknown,
): Promise<ActionResult> {
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

/**
 * Writes only the appearance columns — the account's saved copy of what this device is
 * already displaying.
 *
 * Deliberately does NOT revalidate. The other two do because their values change how the
 * server renders; these change nothing the server draws, since the theme and palette are
 * applied from localStorage before first paint. Revalidating the whole layout every time
 * someone toggles dark mode would re-run four queries to produce identical HTML.
 */
export async function setAppearancePreferences(
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = appearancePreferencesSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .insert(userPreferences)
    .values({ userId, ...parsed.data })
    .onConflictDoUpdate({ target: userPreferences.userId, set: parsed.data })

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
