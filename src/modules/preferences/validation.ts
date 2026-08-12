import { z } from "zod"

import { CURRENCY_CODES, THEMES } from "@/lib/preferences"
import { AI_PROVIDERS } from "@/modules/companion/ai-settings"

// Robust across runtimes: constructing a formatter throws RangeError for an
// unknown IANA zone (no dependence on Intl.supportedValuesOf).
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// Regional/formatting preferences — the Preferences settings section owns exactly
// these. Deliberately excludes the notification fields below: each section submits
// its whole form, so sharing one schema would let either section overwrite the
// other's just-saved values (Zod strips what isn't declared here).
export const userPreferencesSchema = z.object({
  timeZone: z.string().refine(isValidTimeZone, "Unknown time zone"),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]),
  use24HourTime: z.boolean(),
  defaultTaskPriority: z.enum(["low", "medium", "high"]),
  goalMomentumDays: z.union([z.literal(7), z.literal(14), z.literal(30)]),
})
export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>

/** Notification preferences — owned by the Notifications section alone. */
export const notificationPreferencesSchema = z.object({
  digestEnabled: z.boolean(),
})
export type NotificationPreferencesInput = z.infer<
  typeof notificationPreferencesSchema
>

/**
 * Appearance — owned by the Appearance section alone, for the same reason the two
 * schemas above are separate: each section submits its whole form, and a shared schema
 * would let one silently clear another's fields.
 *
 * Unlike the others this is not submitted by a form. The device writes through whenever
 * its own theme changes, so the value arrives from localStorage rather than from an
 * input — which is exactly why it still needs validating.
 */
export const appearancePreferencesSchema = z.object({
  theme: z.enum(THEMES as [string, ...string[]]),
})
export type AppearancePreferencesInput = z.infer<
  typeof appearancePreferencesSchema
>

/**
 * The AI companion's settings — owned by the AI section alone, same as the three above.
 *
 * The API KEY IS NOT IN THIS SCHEMA, and that is the point. It is write-only and travels
 * on its own action: a saved key must survive someone changing the model, and if it rode
 * along in the section's form it would be cleared every time that form submitted with an
 * empty field — which is exactly what a write-only field always looks like.
 */
export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(AI_PROVIDERS),
  // Trimmed because it is pasted, and a trailing space produces a DNS failure reported as
  // "can't reach the AI provider" with nothing pointing at the real cause.
  //
  // Still accepted for every provider, not just `custom`, because the action decides what
  // is actually stored: `resolveBaseUrl` overwrites it with the canonical URL for the two
  // hosted providers and only honours it for `custom`. Rejecting it here instead would
  // make the form's hidden field a validation error rather than an ignored one.
  baseUrl: z.string().trim().max(500),
  model: z.string().trim().max(120),
})
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>

/**
 * Setting or clearing the key, on its own.
 *
 * An empty string is the explicit "remove it" case rather than a validation error: the
 * Remove button and a cleared field are the same intent, and treating one as an error
 * would leave no way to un-set a key from the UI.
 */
export const aiApiKeySchema = z.object({
  apiKey: z.string().trim().max(500),
})
export type AiApiKeyInput = z.infer<typeof aiApiKeySchema>
