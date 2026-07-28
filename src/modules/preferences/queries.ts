import "server-only"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import {
  DEFAULT_PREFERENCES,
  THEMES,
  type Theme,
  type UserPreferences,
} from "@/lib/preferences"

import { userPreferences } from "./schema"

export type UserPreferencesRow = typeof userPreferences.$inferSelect

/** Effective preferences for the current user: the saved row normalised over the
 * defaults, so callers never special-case a missing row (first run). */
export async function getUserPreferences(): Promise<UserPreferences> {
  const userId = await requireUserId()
  const row = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  })
  if (!row) return DEFAULT_PREFERENCES
  return {
    timeZone: row.timeZone,
    weekStartsOn: row.weekStartsOn === 1 ? 1 : 0,
    currency: row.currency,
    use24HourTime: row.use24HourTime,
    defaultTaskPriority: row.defaultTaskPriority,
    digestEnabled: row.digestEnabled,
    // The account's saved appearance. Not what this device is currently rendering —
    // that comes from localStorage before any of this runs. See lib/preferences.ts.
    theme: THEMES.includes(row.theme as Theme)
      ? (row.theme as Theme)
      : "system",
    palette: row.palette,
  }
}
