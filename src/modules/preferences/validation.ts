import { z } from "zod"

import {
  CALENDAR_CARD_VIEWS,
  CALENDAR_VIEWS,
  CURRENCY_CODES,
  DASHBOARD_CARDS,
  DATE_FORMATS,
  MEAL_TYPES,
  THEMES,
  VOLUME_UNITS,
  WEIGHT_UNITS,
} from "@/lib/preferences"
import { navItems } from "@/components/shared/nav-items"
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

/**
 * Region & formats — owned by the Region settings page alone.
 *
 * The preferences schema used to be one object of fifteen fields behind one Save button,
 * with a note saying that if it grew further it should be split by SUBJECT rather than by
 * whether a field formats something. It grew further. These seven are the regional ones:
 * how a date, a time, an amount of money or a weight READS, and which day a week begins
 * on. None of them change what the app does — only how it shows it.
 *
 * Its own schema for the reason every settings section has one: each page submits its
 * whole form, and `setRegionPreferences` writes exactly the keys parsed here (`set:
 * parsed.data`), so a save on this page cannot touch a field the Defaults page owns. The
 * partition — every one of the fifteen in exactly one of the two — is asserted in
 * `validation.test.ts`, because a field that landed in neither would simply stop being
 * saveable, with nothing on screen to say so.
 */
export const regionPreferencesSchema = z.object({
  timeZone: z.string().refine(isValidTimeZone, "Unknown time zone"),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]),
  use24HourTime: z.boolean(),
  dateFormat: z.enum(DATE_FORMATS),
  weightUnit: z.enum(WEIGHT_UNITS),
  volumeUnit: z.enum(VOLUME_UNITS),
})
export type RegionPreferencesInput = z.infer<typeof regionPreferencesSchema>

/**
 * Defaults — owned by the Defaults settings page alone: the eight that change what the
 * app DOES for you rather than how it reads. Where signing in lands, which view a
 * calendar opens on, what quick-add files a meal under, how far back a goal looks before
 * calling itself stalled.
 */
export const defaultPreferencesSchema = z.object({
  defaultTaskPriority: z.enum(["low", "medium", "high"]),
  goalMomentumDays: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  balanceMacroTargets: z.boolean(),
  defaultCalendarView: z.enum(CALENDAR_VIEWS as [string, ...string[]]),
  slateHorizonDays: z.union([z.literal(3), z.literal(7), z.literal(14)]),
  dashboardCalendarView: z.enum(CALENDAR_CARD_VIEWS),
  // Validated against the nav itself rather than a duplicated list of paths. A hand-written
  // copy here would be a second thing to keep in step with `navItems`, and the failure would
  // be a landing page that saves and then 404s.
  landingPage: z.enum(
    navItems.map((item) => item.href) as [string, ...string[]],
  ),
  // Null is Other — a real choice rather than an unset field.
  //
  // No `.transform()` here, deliberately, and it is worth saying why since the link pickers
  // elsewhere do use one. Every other field in THIS schema has an input type identical to
  // its output, which is what lets the settings form be typed `useForm<DefaultPreferencesInput>`
  // against `z.infer`. A transform makes the two differ and the resolver stops type-checking
  // against the form. The Select emits `null` directly instead.
  defaultMealType: z.enum(MEAL_TYPES).nullable(),
  // A list id, or null for none. Whose list it is cannot be a schema's business — the
  // action checks that — and the column's `set null` covers a list deleted later.
  defaultListId: z.string().uuid().nullable(),
  trackWeight: z.boolean(),
  // Pounds, whatever the account displays — the form converts, as the weigh-in card does.
  // The same bounds as a weigh-in: a goal outside them is a typo, not an ambition.
  goalWeightLb: z
    .number()
    .min(20, "That looks too low")
    .max(1500, "That looks too high")
    .nullable(),
  // `dashboardCollapsed` is deliberately ABSENT from both schemas.
  //
  // It is part of `UserPreferences`, but no settings form is one of its writers — the
  // chevron on each card is the only control, through `setDashboardCard`. Every preferences
  // action updates exactly the keys its schema parses, so leaving it out means saving
  // anything under /settings cannot touch the column. Including it would have made the round
  // trip depend on react-hook-form carrying an unregistered array through `handleSubmit`,
  // and RHF is known here to drop fields it thinks you did not mean to submit.
})
export type DefaultPreferencesInput = z.infer<typeof defaultPreferencesSchema>

/**
 * The two together — every user-editable preference except the ones with a section of
 * their own below (notifications, appearance, the AI companion).
 *
 * Composed from the two page schemas rather than declared a third time, so it cannot drift
 * from them. Kept for anything that writes a whole preferences row at once rather than one
 * page's worth.
 */
export const userPreferencesSchema = z.object({
  ...regionPreferencesSchema.shape,
  ...defaultPreferencesSchema.shape,
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

/**
 * One dashboard card, folded or unfolded.
 *
 * `z.enum` over the registry rather than a plain string: this value is written straight into
 * a `jsonb` column that nothing else validates on the way in, so an unknown key would be
 * stored happily and only get filtered back out on read — a write that silently does nothing.
 */
export const dashboardCardSchema = z.object({
  card: z.enum(DASHBOARD_CARDS),
  collapsed: z.boolean(),
})
