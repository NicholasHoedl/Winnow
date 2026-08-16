"use server"

import { revalidatePath } from "next/cache"

import { sql } from "drizzle-orm"

import { db } from "@/db"
import { type ActionResult, invalid } from "@/lib/action-result"
import { requireUserId } from "@/lib/session"
import { resolveBaseUrl } from "@/modules/companion/ai-settings"

import { userPreferences } from "./schema"
import {
  aiApiKeySchema,
  aiSettingsSchema,
  appearancePreferencesSchema,
  dashboardCardSchema,
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

/**
 * The companion's settings, minus the key.
 *
 * Revalidates the whole layout because `aiReady` decides whether the Companion gets a nav
 * tab, a dashboard button and a palette entry — turning the feature on has to make those
 * appear without a manual reload.
 */
export async function setAiSettings(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = aiSettingsSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const values = {
    aiEnabled: parsed.data.enabled,
    aiProvider: parsed.data.provider,
    // Resolved HERE rather than on read. For `anthropic` and `openai` the canonical URL
    // wins and whatever the form sent is ignored — the field is not even shown for them.
    // Only `custom` keeps what was typed, which is the whole point of that option.
    aiBaseUrl: resolveBaseUrl(parsed.data.provider, parsed.data.baseUrl),
    aiModel: parsed.data.model,
  }
  await db
    .insert(userPreferences)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userPreferences.userId, set: values })

  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Set or clear the API key, on its own action.
 *
 * Separate from `setAiSettings` so the key survives every other edit — see the note on
 * `aiApiKeySchema`. Returns nothing about the key: the caller re-reads the masked hint
 * from the server rather than being told what was stored.
 */
export async function setAiApiKey(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = aiApiKeySchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  await db
    .insert(userPreferences)
    .values({ userId, aiApiKey: parsed.data.apiKey })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { aiApiKey: parsed.data.apiKey },
    })

  // The key alone changes nothing the server renders — `aiReady` does not consider it, so
  // a local endpoint needs none. Revalidating anyway would be a whole-layout rerender for
  // no visible difference.
  revalidatePath("/settings")
  return { ok: true }
}

/**
 * Fold or unfold one dashboard card.
 *
 * Takes the DESIRED state rather than "flip". A flip makes the outcome depend on how many
 * clicks arrived, so a double-click, a retry, or a replayed request lands somewhere
 * different from where the user is looking; setting a boolean is idempotent and a repeat is
 * a no-op.
 *
 * **Modified in the database, never read first.** This was a read-modify-write, on the
 * reasoning that only two tabs racing could lose an update. That was wrong, and
 * `dashboard-collapse.spec.ts` proved it: the fold is optimistic, so one person in ONE tab
 * can fold a second card while the first write is still in flight, and the second action
 * then reads a row that does not yet know about the first. Folding two cards quickly left
 * one of them expanded, and which one varied between runs.
 *
 * So both branches are single atomic statements:
 *   collapse — `|| '["macros"]'`, appending to whatever is there at the moment it runs
 *   expand   — `- 'macros'`, which removes every matching element
 *
 * `||` can append a key that is already present. That is deliberate rather than tolerated:
 * `parseCollapsedCards` deduplicates on read, which turns what was a defensive test into a
 * load-bearing one. A duplicate is only reachable by racing double-clicks and the next
 * expand clears every copy.
 *
 * `revalidatePath("/")` and not `"layout"`: this changes nothing outside the dashboard.
 */
export async function setDashboardCard(
  card: unknown,
  collapsed: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = dashboardCardSchema.safeParse({ card, collapsed })
  if (!parsed.success) return invalid(parsed.error)

  const { card: key, collapsed: fold } = parsed.data
  // In an ON CONFLICT DO UPDATE, a bare column reference is the row already stored — so
  // this reads and writes in one statement rather than across two round trips.
  const next = fold
    ? sql`${userPreferences.dashboardCollapsed} || ${JSON.stringify([key])}::jsonb`
    : sql`${userPreferences.dashboardCollapsed} - ${key}`

  await db
    .insert(userPreferences)
    // Only reached when the user has no preferences row at all, where there is nothing to
    // merge with and the whole list is whatever this call is asking for.
    .values({ userId, dashboardCollapsed: fold ? [key] : [] })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { dashboardCollapsed: next },
    })

  revalidatePath("/")
  return { ok: true }
}
