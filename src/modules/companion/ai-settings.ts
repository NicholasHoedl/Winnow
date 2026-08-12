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

/**
 * What the user PICKS, which is not the same thing as the wire protocol they get.
 *
 * `AiProvider` in `ai-request.ts` is a protocol — there are exactly two, and the comment
 * there explains why Anthropic cannot be an OpenAI dialect. This is the settings-level
 * choice, and it carries one more option: `custom`, for an endpoint you host or proxy
 * yourself. That speaks the OpenAI protocol; what makes it a separate CHOICE is that it is
 * the only one whose base URL you supply.
 *
 * ADR-0011 records the local-model decision as reversible because "a local endpoint is one
 * setting away". `custom` is that setting, made explicit rather than implied by an
 * editable URL box.
 */
export const AI_PROVIDERS = ["anthropic", "openai", "custom"] as const
export type AiProviderChoice = (typeof AI_PROVIDERS)[number]

/**
 * Where each choice talks to. `null` means "the user supplies it".
 *
 * These are the versioned API roots, not the bare hosts: `buildRequestUrl` appends
 * `/messages` or `/chat/completions` to whatever it is given.
 */
export const PROVIDER_BASE_URL: Record<AiProviderChoice, string | null> = {
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  custom: null,
}

/** The companion's configuration, minus the secret. Safe to send to a browser. */
export type AiSettings = {
  enabled: boolean
  provider: AiProviderChoice
  baseUrl: string
  model: string
}

/** The same, plus the key. `server-only` callers only — never crosses to the client. */
export type AiConfig = AiSettings & { apiKey: string }

/**
 * Which of the two wire protocols a choice speaks.
 *
 * `custom` maps to `openai` because that is what self-hosted servers almost universally
 * emit — Ollama, LM Studio, vLLM and every proxy in between. Someone running an
 * Anthropic-shaped endpoint of their own would pick `anthropic` and override nothing,
 * which the form does not currently allow; that is a real gap and a small one.
 */
export function wireProtocol(choice: AiProviderChoice): AiProvider {
  return choice === "anthropic" ? "anthropic" : "openai"
}

/**
 * Narrow a stored string to a provider choice.
 *
 * The column is plain text so a new provider needs no migration, which means an import or
 * a hand-edited row can hold anything. Same treatment `weekStartsOn` and `theme` already
 * get in `preferencesFor`: an unrecognised value becomes the common case rather than
 * reaching the request builder and producing an unexplained 400.
 */
export function toProvider(value: string): AiProviderChoice {
  return (AI_PROVIDERS as readonly string[]).includes(value)
    ? (value as AiProviderChoice)
    : "openai"
}

/**
 * The base URL a choice should be SAVED with.
 *
 * Applied when settings are written, never when they are read, and the difference matters
 * more than it looks: the e2e suite points the companion at its local stub by writing the
 * column directly, and resolving on read would silently replace that with the real
 * provider's URL — sending test traffic to a paid API. Save-time resolution leaves a
 * stored value alone once it is stored.
 */
export function resolveBaseUrl(
  choice: AiProviderChoice,
  submitted: string,
): string {
  return PROVIDER_BASE_URL[choice] ?? submitted.trim()
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
