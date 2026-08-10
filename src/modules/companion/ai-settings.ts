/**
 * Resolving the companion's configuration, and deciding whether it is usable.
 *
 * Pure and dependency-free, for the same reason `ai-request.ts` is: the reader that fetches
 * these values is `server-only` and the test runner cannot import it at all, so the rules
 * live here where they can be tested directly.
 *
 * T11 moved this out of the environment entirely. `AI_ENABLED` / `AI_PROVIDER` /
 * `AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY` are gone: two sources for one setting would
 * need a precedence rule, and a precedence rule produces a settings page that sometimes
 * silently does nothing.
 */

import type { AiProvider } from "./ai-request"

/** The companion's configuration, minus the secret. Safe to send to a browser. */
export type AiSettings = {
  enabled: boolean
  provider: AiProvider
  baseUrl: string
  model: string
}

/** The same, plus the key. `server-only` callers only — never crosses to the client. */
export type AiConfig = AiSettings & { apiKey: string }

export const AI_PROVIDERS = ["openai", "anthropic"] as const

/**
 * Narrow a stored string to a provider.
 *
 * The column is plain text so a third provider needs no migration, which means an import or
 * a hand-edited row can hold anything. Same treatment `weekStartsOn` and `theme` already
 * get in `preferencesFor`: an unrecognised value becomes the common case rather than
 * reaching the request builder and producing an unexplained 400.
 */
export function toProvider(value: string): AiProvider {
  return value === "anthropic" ? "anthropic" : "openai"
}

/**
 * Enabled AND configured.
 *
 * Turning the feature on without a base URL or model is a half-filled form, not a feature —
 * treat it as off, so the companion simply is not there rather than failing at the moment
 * someone presses a button. This is the same rule the old `AI_READY` constant applied to a
 * half-filled `.env`, kept verbatim because the failure it prevents is unchanged.
 *
 * The API KEY is deliberately not required: a local endpoint usually wants no auth at all,
 * and demanding one would make a self-hosted model impossible to point at — which ADR-0011
 * explicitly keeps one env var away, now one settings field away.
 */
export function aiReady(settings: AiSettings): boolean {
  return settings.enabled && settings.baseUrl !== "" && settings.model !== ""
}

/**
 * What the settings page may show about a saved key: that there is one, and just enough of
 * it to recognise which. Never the key.
 *
 * The last four characters only. Providers print keys with a long identifying prefix
 * (`sk-ant-api03-…`), so showing the START would reveal nothing distinguishing while
 * looking like it does — the tail is what tells two keys apart.
 */
export function maskApiKey(key: string): string | null {
  if (!key) return null
  // Too short to reveal a tail without revealing most of it.
  if (key.length <= 8) return "••••"
  return `••••${key.slice(-4)}`
}
