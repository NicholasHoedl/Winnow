// Client-safe constants, defaults, and option lists for user preferences.
// (No server-only / DB imports — this is imported by both the settings UI and
// the server validation/query layer.)
//
// Appearance (theme) is here as of T6a, but read differently from the rest: next-themes
// applies it from localStorage before first paint, so this value is the account's saved
// copy — what a new device adopts and what the export carries — not what the current
// device renders from.

export type WeekStart = 0 | 1
export type Priority = "low" | "medium" | "high"
export type Theme = "light" | "dark" | "system"

/**
 * The goal momentum window, in days. A closed set rather than a free integer: it drives a
 * segmented control, and "how long before I call a goal stalled" is a question with three
 * honest answers, not 365.
 */
export type MomentumDays = 7 | 14 | 30

/**
 * The calendar's four views, duplicated here rather than imported.
 *
 * `CALENDAR_VIEWS` proper lives in `app/(app)/calendar/_components/views.ts` alongside the
 * URL helpers that use it. This file is imported by the server validation and query layer,
 * which must not reach into a route's `_components` — so the list is restated, and the two
 * are kept in step by `views.ts` importing THIS type rather than the other way round.
 */
export type CalendarView = "month" | "week" | "day" | "agenda"
export const CALENDAR_VIEWS: CalendarView[] = ["month", "week", "day", "agenda"]

/**
 * How far ahead Slate reaches for highlighted events. A closed set for the reason
 * `MomentumDays` is one: "how early do I want to see a flagged event" has a few honest
 * answers, not 365.
 */
export type SlateHorizonDays = 3 | 7 | 14
export const SLATE_HORIZONS: SlateHorizonDays[] = [3, 7, 14]

/**
 * The dashboard surfaces that can be folded to their header.
 *
 * `macros` and `budget` are the two stat tiles, which fold independently — they are
 * separate tiles with separate destinations, and grouping them under one chevron would have
 * meant inventing a heading the dashboard does not otherwise have.
 *
 * Adding a card here is the whole registration: the column stores whatever keys it is
 * given and `preferencesFor` filters against this list, so an unknown key is dropped rather
 * than trusted. That is what makes deleting a card free.
 */
export const DASHBOARD_CARDS = [
  "slate",
  "goals",
  "calendar",
  "macros",
  "budget",
  "categories",
] as const
export type DashboardCard = (typeof DASHBOARD_CARDS)[number]

/**
 * The collapsed-card list, reduced to keys this build actually has.
 *
 * The column is `jsonb`, so what comes back is genuinely `unknown` — an import, a restore
 * from an older build, or a hand-edited row can hold anything at all. Filtering rather than
 * failing is the point of storing a list instead of a column per card: a key for a card that
 * has since been deleted stops matching and the rest still work, where a dropped column
 * would have needed a migration.
 *
 * Deduped, because a double write should not be able to make `includes` disagree with
 * itself, and order is not meaningful — this answers "is X folded?", nothing more.
 */
export function parseCollapsedCards(value: unknown): DashboardCard[] {
  if (!Array.isArray(value)) return []
  const known = new Set<string>(DASHBOARD_CARDS)
  return Array.from(
    new Set(value.filter((v): v is DashboardCard => known.has(v as string))),
  )
}

export const THEMES: Theme[] = ["light", "dark", "system"]
export const MOMENTUM_DAYS: MomentumDays[] = [7, 14, 30]

export type UserPreferences = {
  timeZone: string
  weekStartsOn: WeekStart
  currency: string
  use24HourTime: boolean
  defaultTaskPriority: Priority
  digestEnabled: boolean
  goalMomentumDays: MomentumDays
  theme: Theme
  balanceMacroTargets: boolean
  defaultCalendarView: CalendarView
  slateHorizonDays: SlateHorizonDays
  dashboardCollapsed: DashboardCard[]
}

// Mirrors the DB column defaults; used as the fallback when a user has no saved
// row yet so nothing downstream has to special-case first run.
export const DEFAULT_PREFERENCES: UserPreferences = {
  timeZone: "America/Chicago",
  weekStartsOn: 0,
  currency: "USD",
  use24HourTime: false,
  defaultTaskPriority: "medium",
  digestEnabled: true,
  goalMomentumDays: 14,
  theme: "system",
  balanceMacroTargets: true,
  defaultCalendarView: "month",
  slateHorizonDays: 7,
  // Nothing folded on a fresh install: a dashboard that arrives with cards already closed
  // would read as broken rather than as tidy.
  dashboardCollapsed: [],
}

// Curated ISO 4217 codes (money is stored as integer cents regardless of code).
export const CURRENCIES: { code: string; label: string }[] = [
  { code: "USD", label: "US Dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "CAD", label: "Canadian Dollar (C$)" },
  { code: "AUD", label: "Australian Dollar (A$)" },
  { code: "JPY", label: "Japanese Yen (¥)" },
  { code: "CHF", label: "Swiss Franc (CHF)" },
  { code: "CNY", label: "Chinese Yuan (¥)" },
  { code: "INR", label: "Indian Rupee (₹)" },
  { code: "MXN", label: "Mexican Peso (MX$)" },
  { code: "BRL", label: "Brazilian Real (R$)" },
  { code: "SEK", label: "Swedish Krona (kr)" },
  { code: "NZD", label: "New Zealand Dollar (NZ$)" },
]

export const CURRENCY_CODES: string[] = CURRENCIES.map((c) => c.code)

export const WEEK_START_OPTIONS: { value: WeekStart; label: string }[] = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
]

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
]

// Labelled in the units people actually think in — nobody plans in "14 days".
export const MOMENTUM_OPTIONS: { value: MomentumDays; label: string }[] = [
  { value: 7, label: "1 week" },
  { value: 14, label: "2 weeks" },
  { value: 30, label: "1 month" },
]

export const BALANCE_TARGET_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
]

// Labelled in the units people think in, like MOMENTUM_OPTIONS below.
export const SLATE_HORIZON_OPTIONS: {
  value: SlateHorizonDays
  label: string
}[] = [
  { value: 3, label: "3 days" },
  { value: 7, label: "1 week" },
  { value: 14, label: "2 weeks" },
]

export const CALENDAR_VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "agenda", label: "Agenda" },
]

// The runtime's full IANA zone list when available (server Node + modern
// browsers), else a small sane fallback so the picker is never empty.
export function timeZoneOptions(): string[] {
  const withSupported = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[]
  }
  if (typeof withSupported.supportedValuesOf === "function") {
    try {
      return withSupported.supportedValuesOf("timeZone")
    } catch {
      /* fall through */
    }
  }
  return [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "UTC",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Australia/Sydney",
  ]
}
