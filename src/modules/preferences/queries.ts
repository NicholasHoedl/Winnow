import "server-only"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import {
  DEFAULT_PREFERENCES,
  MOMENTUM_DAYS,
  type MomentumDays,
  THEMES,
  type Theme,
  type UserPreferences,
} from "@/lib/preferences"

import { userPreferences } from "./schema"

export type UserPreferencesRow = typeof userPreferences.$inferSelect

/** Effective preferences for the current user: the saved row normalised over the
 * defaults, so callers never special-case a missing row (first run). */
export async function getUserPreferences(): Promise<UserPreferences> {
  return preferencesFor(await requireUserId())
}

/**
 * The same, for a user resolved some way other than the session.
 *
 * Split out for the .ics subscribe feed, which authenticates with a token and so has no
 * session to read a user from — but still needs the zone, because the feed renders
 * wall-clock times exactly as the app does. Same shape as `rangeOccurrences` taking an
 * explicit userId next to `getRangeEvents`.
 */
export async function preferencesFor(userId: string): Promise<UserPreferences> {
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
    // Narrowed the same way weekStartsOn is: the column is a plain integer, so an import
    // or a hand-edited row can hold anything, and the reading it drives has to be one of
    // the three the UI can express.
    goalMomentumDays: MOMENTUM_DAYS.includes(
      row.goalMomentumDays as MomentumDays,
    )
      ? (row.goalMomentumDays as MomentumDays)
      : DEFAULT_PREFERENCES.goalMomentumDays,
    // The account's saved appearance. Not what this device is currently rendering —
    // that comes from localStorage before any of this runs. See lib/preferences.ts.
    theme: THEMES.includes(row.theme as Theme)
      ? (row.theme as Theme)
      : "system",
  }
}
