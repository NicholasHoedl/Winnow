// Client-safe constants, defaults, and option lists for user preferences.
// (No server-only / DB imports — this is imported by both the settings UI and
// the server validation/query layer.) Appearance settings (theme + palette)
// are NOT here — those live client-side via next-themes + the palette provider.

export type WeekStart = 0 | 1
export type Priority = "low" | "medium" | "high"

export type UserPreferences = {
  timeZone: string
  weekStartsOn: WeekStart
  currency: string
  use24HourTime: boolean
  defaultTaskPriority: Priority
}

// Mirrors the DB column defaults; used as the fallback when a user has no saved
// row yet so nothing downstream has to special-case first run.
export const DEFAULT_PREFERENCES: UserPreferences = {
  timeZone: "America/Chicago",
  weekStartsOn: 0,
  currency: "USD",
  use24HourTime: false,
  defaultTaskPriority: "medium",
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
