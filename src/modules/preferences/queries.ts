import "server-only"
import { cache } from "react"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"
import {
  maskApiKey,
  toProvider,
  type AiConfig,
  type AiSettings,
} from "@/modules/companion/ai-settings"
import {
  CALENDAR_VIEWS,
  type CalendarView,
  DEFAULT_PREFERENCES,
  MOMENTUM_DAYS,
  type MomentumDays,
  THEMES,
  type Theme,
  type UserPreferences,
} from "@/lib/preferences"

import { userPreferences } from "./schema"

/**
 * Effective preferences for the current user: the saved row normalised over the
 * defaults, so callers never special-case a missing row (first run).
 *
 * `cache()` because almost every read needs the zone and the week start, so this ran four
 * times on one /activity render and six on the dashboard — the layout, the page, and each
 * module query that derives "today" for itself. Per-request, so a preference saved in one
 * request is read fresh by the next.
 *
 * `preferencesFor` is deliberately left uncached: its one caller outside this file is the
 * .ics feed, which authenticates with a token and calls it exactly once.
 */
export const getUserPreferences = cache(async (): Promise<UserPreferences> =>
  preferencesFor(await requireUserId()),
)

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
    balanceMacroTargets: row.balanceMacroTargets,
    // Narrowed like `theme`: the column is plain text so the view set can grow without a
    // migration, which also means an imported row can hold a view this build has never
    // heard of. Falling back keeps `/calendar` renderable rather than 404-ing on a value
    // nobody can see or fix.
    defaultCalendarView: CALENDAR_VIEWS.includes(
      row.defaultCalendarView as CalendarView,
    )
      ? (row.defaultCalendarView as CalendarView)
      : DEFAULT_PREFERENCES.defaultCalendarView,
  }
}

/**
 * The companion's settings, WITHOUT the key.
 *
 * Deliberately not folded into `UserPreferences`. That shape is handed to
 * `PreferencesProvider` in the app layout, which is a client component — so everything in
 * it is serialised into the RSC payload and reaches the browser. These four are harmless
 * there, but keeping them in a separate function means the key has no path into that shape
 * even by accident, and the field-by-field list above stays the only thing standing between
 * a new column and the client.
 */
export async function getAiSettings(): Promise<AiSettings> {
  return aiSettingsFor(await requireUserId())
}

export async function aiSettingsFor(userId: string): Promise<AiSettings> {
  const row = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
    columns: {
      aiEnabled: true,
      aiProvider: true,
      aiBaseUrl: true,
      aiModel: true,
    },
  })
  if (!row) return DEFAULT_AI_SETTINGS
  return {
    enabled: row.aiEnabled,
    provider: toProvider(row.aiProvider),
    baseUrl: row.aiBaseUrl,
    model: row.aiModel,
  }
}

const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: "openai",
  baseUrl: "",
  model: "",
}

/**
 * The settings PLUS the key, for the one caller that puts it on the wire.
 *
 * Separate from `getAiSettings` so the key is fetched only where it is used. Grep for this
 * function to enumerate everything that can see it — the answer should stay "ai-client.ts".
 */
export async function getAiConfig(): Promise<AiConfig> {
  const userId = await requireUserId()
  const row = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
    columns: {
      aiEnabled: true,
      aiProvider: true,
      aiBaseUrl: true,
      aiModel: true,
      aiApiKey: true,
    },
  })
  if (!row) return { ...DEFAULT_AI_SETTINGS, apiKey: "" }
  return {
    enabled: row.aiEnabled,
    provider: toProvider(row.aiProvider),
    baseUrl: row.aiBaseUrl,
    model: row.aiModel,
    apiKey: row.aiApiKey,
  }
}

/**
 * What the settings form needs: the settings, and a HINT about the key rather than the key.
 * `hasKey` drives the copy; `keyHint` identifies which key is saved without disclosing it.
 */
export async function getAiSettingsView(): Promise<
  AiSettings & { hasKey: boolean; keyHint: string | null }
> {
  const config = await getAiConfig()
  const { apiKey, ...settings } = config
  return { ...settings, hasKey: apiKey !== "", keyHint: maskApiKey(apiKey) }
}
