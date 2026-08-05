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

// --- AI companion (ADR-0011) ---
//
// Opt-IN, unlike OFF above, and the asymmetry is deliberate: this one needs an API key,
// costs money per call, and sends your data to a third party. A fresh install should do
// none of those until someone says so. With it off, /companion 404s and nothing in the
// app hints the feature exists.
export const AI_ENABLED = process.env.AI_ENABLED === "true"

// Any OpenAI-compatible chat-completions endpoint. Kept configurable precisely because
// ADR-0011 chose a hosted provider: a local endpoint is one env var away, which is what
// the deferred journal-aware features would need.
export const AI_BASE_URL = process.env.AI_BASE_URL ?? ""
export const AI_MODEL = process.env.AI_MODEL ?? ""
export const AI_API_KEY = process.env.AI_API_KEY ?? ""

/**
 * Enabled AND configured. `AI_ENABLED=true` with no base URL or model is a
 * misconfiguration, not a feature — treat it as off rather than failing at call time,
 * so a half-filled `.env` degrades to "the feature isn't there" instead of an error
 * every time you press a button.
 */
export const AI_READY = AI_ENABLED && AI_BASE_URL !== "" && AI_MODEL !== ""
