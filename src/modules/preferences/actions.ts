"use server"

import { revalidatePath } from "next/cache"

import { db } from "@/db"
import { type ActionResult, invalid } from "@/lib/action-result"
import { requireUserId } from "@/lib/session"

import { userPreferences } from "./schema"
import { userPreferencesSchema } from "./validation"

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
