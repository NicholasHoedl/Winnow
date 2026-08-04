import { z } from "zod"

import { CURRENCY_CODES, THEMES } from "@/lib/preferences"

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
