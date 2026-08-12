// IANA timezone used to compute "due today" / "overdue" for date-only fields.
// Single-user app: one fixed zone, overridable via env.
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "America/Chicago"

// `APP_CURRENCY` was here and is gone: the display currency moved to
// `user_preferences.currency`, read through `getUserPreferences`, the same journey the AI
// settings took below and for the same reason. Noted rather than silently deleted because
// `.env.example` files in older checkouts still set it, and it now does nothing.

// Open Food Facts — the app's only outbound HTTP call (ADR-0005). Opt-OUT, because the
// common case is a machine with internet; an install without it sets OFF_ENABLED=false
// and the food-database UI disappears instead of offering a search that can never work.
export const OFF_ENABLED = process.env.OFF_ENABLED !== "false"

// Two hosts, because OFF splits them: the read API serves products by barcode, and
// full-text search lives on a separate service. Overridable so a test or an air-gapped
// install can point them somewhere local.
export const OFF_API_URL =
  process.env.OFF_API_URL ?? "https://world.openfoodfacts.org"
export const OFF_SEARCH_URL =
  process.env.OFF_SEARCH_URL ?? "https://search.openfoodfacts.org"

// --- AI companion (ADR-0011) ---
//
// Nothing lives here any more. T11 moved the companion's configuration out of the
// environment and into the settings page: `user_preferences.ai_*`, read at request time by
// `getAiSettings` / `getAiConfig` in `modules/preferences/queries.ts`, with `aiReady` in
// `modules/companion/ai-settings.ts` deciding whether it is usable.
//
// The env vars were REMOVED rather than kept as a fallback. Two sources for one setting
// needs a precedence rule, and a precedence rule produces a settings page that sometimes
// silently does nothing. The opt-in property ADR-0011 asked for survives the move: the
// columns default to off, so a fresh install and a restored backup both have no companion
// until someone fills the form in.
