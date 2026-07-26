// IANA timezone used to compute "due today" / "overdue" for date-only fields.
// Single-user app: one fixed zone, overridable via env.
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "America/Chicago"

// Currency for money display (money is stored as integer cents regardless).
export const APP_CURRENCY = process.env.APP_CURRENCY ?? "USD"

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
