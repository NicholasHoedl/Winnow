// The AI provider wire protocol: URL shape, timeout, the failure taxonomy, and the
// request body. Pure and dependency-free so it can be unit-tested — ai-client.ts is
// `server-only` and the test runner cannot import it at all.
//
// Deliberately modelled on meals/off-request.ts. That pairing exists because ADR-0005
// established the rule this feature also lives under: an outbound call on a self-hosted
// box fails routinely, and failure has to be a value the UI can render, never an
// exception that takes a page down.

import type { ChatMessage } from "./service"

/** Why a generation didn't produce a proposal. Never an exception — see ADR-0011. */
export type AiFailure =
  /** Switched off in Settings, or the base URL / model is unset. The UI hides the feature. */
  | { kind: "disabled" }
  /** DNS/connect failed. The home connection is down, or the provider is unreachable. */
  | { kind: "offline" }
  | { kind: "timeout" }
  | { kind: "http"; status: number }
  /** Answered, but not with a plan this app can use — see the note on validation. */
  | { kind: "malformed" }

export type AiResult<T> =
  { ok: true; data: T } | { ok: false; failure: AiFailure }

/**
 * Generous, because this is not a keystroke — it is a person who pressed a button
 * expecting to wait. Still bounded: past this the provider is not coming back, and a
 * request left hanging holds a connection and tells the user nothing.
 */
export const GENERATE_TIMEOUT_MS = 90_000

/**
 * The two wire protocols this app speaks.
 *
 * Anthropic is not an OpenAI dialect. It has a different path, a different auth header, a
 * required API-version header, `system` hoisted out of the message list, a REQUIRED output
 * ceiling, and structured output through tool-use rather than `response_format`. Six
 * differences, each of which is a 400 on its own — hence a second protocol rather than a
 * base-URL swap.
 */
export type AiProvider = "openai" | "anthropic"

/** Anthropic pins its API by header, and rejects the request without it. */
const ANTHROPIC_VERSION = "2023-06-01"

/**
 * Anthropic requires `max_tokens`; OpenAI treats it as optional. Sized for the largest
 * thing any job asks for — a transaction import can legitimately return dozens of rows —
 * because truncation arrives as a half-written JSON object, which the Zod parse rejects as
 * `malformed` with nothing on screen to say the real cause was length.
 */
export const MAX_OUTPUT_TOKENS = 8192

export function buildRequestUrl(provider: AiProvider, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "")
  return provider === "anthropic"
    ? `${base}/messages`
    : `${base}/chat/completions`
}

/**
 * Auth and version headers per provider.
 *
 * The key is omitted when unset for the same reason as before: a local endpoint usually
 * wants no auth at all, and some reject an empty credential outright.
 */
export function buildRequestHeaders(
  provider: AiProvider,
  apiKey: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (provider === "anthropic") {
    headers["anthropic-version"] = ANTHROPIC_VERSION
    if (apiKey) headers["x-api-key"] = apiKey
    return headers
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

export function classifyFetchError(error: unknown): AiFailure {
  const name = error instanceof Error ? error.name : ""
  if (name === "TimeoutError" || name === "AbortError")
    return { kind: "timeout" }
  return { kind: "offline" }
}

/**
 * The request body, in the OpenAI-compatible shape every candidate provider speaks.
 *
 * `response_format` asks for structured output against the schema. Providers that do not
 * support it ignore the field and answer with prose-wrapped JSON — which the caller's Zod
 * parse then rejects as `malformed`. That degradation is the design: the schema is
 * enforced on our side regardless of what the provider promises, so an unsupported
 * provider is a visible failure rather than bad data.
 *
 * `temperature` is low but not zero. Planning benefits from a little variation — a
 * regenerate that returns byte-identical output is a wasted call.
 */
export function buildChatBody(
  model: string,
  messages: ChatMessage[],
  jsonSchema: unknown,
): Record<string, unknown> {
  return {
    model,
    messages,
    temperature: 0.4,
    response_format: {
      type: "json_schema",
      json_schema: { name: "plan", strict: true, schema: jsonSchema },
    },
  }
}

/** The tool Anthropic is forced to call. The name is arbitrary but must match `tool_choice`. */
const EMIT_TOOL = "emit_payload"

/**
 * The request body for Anthropic's messages API.
 *
 * Three things differ from the OpenAI shape beyond field names:
 *
 * 1. **`system` is a top-level string**, not a message. Anthropic rejects `role: "system"`
 *    inside `messages`, so the system prompts are hoisted and joined here. Every builder in
 *    `service.ts` emits exactly one system message followed by one user message, but this
 *    joins whatever it is given rather than assuming that stays true.
 * 2. **Structured output is tool-use**, not `response_format`. `tool_choice` naming a
 *    specific tool FORCES the call, which makes the schema binding real rather than a
 *    request the provider may ignore — the weakness the OpenAI path documents above.
 * 3. **`max_tokens` is required.** See MAX_OUTPUT_TOKENS.
 *
 * `$schema` is stripped: Zod 4 emits it, Anthropic has no use for it, and an unexpected
 * meta key in `input_schema` is a cheap 400 to avoid.
 */
export function buildAnthropicBody(
  model: string,
  messages: ChatMessage[],
  jsonSchema: unknown,
): Record<string, unknown> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n")
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }))

  const schema =
    typeof jsonSchema === "object" && jsonSchema !== null
      ? Object.fromEntries(
          Object.entries(jsonSchema as Record<string, unknown>).filter(
            ([key]) => key !== "$schema",
          ),
        )
      : jsonSchema

  return {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0.4,
    ...(system ? { system } : {}),
    messages: rest,
    tools: [
      {
        name: EMIT_TOOL,
        description: "Return the result as structured data.",
        input_schema: schema,
      },
    ],
    tool_choice: { type: "tool", name: EMIT_TOOL },
  }
}

export function buildRequestBody(
  provider: AiProvider,
  model: string,
  messages: ChatMessage[],
  jsonSchema: unknown,
): Record<string, unknown> {
  return provider === "anthropic"
    ? buildAnthropicBody(model, messages, jsonSchema)
    : buildChatBody(model, messages, jsonSchema)
}

/**
 * Dig the assistant's message content out of a chat-completions response without
 * asserting anything about the rest of it. Returns null when the shape is not what we
 * expect, which the caller turns into `malformed`.
 */
export function extractContent(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null
  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const message = (choices[0] as { message?: unknown }).message
  if (typeof message !== "object" || message === null) return null
  const content = (message as { content?: unknown }).content
  return typeof content === "string" ? content : null
}

/**
 * Dig the forced tool call's input out of an Anthropic messages response.
 *
 * The payload arrives as an already-parsed OBJECT on a `tool_use` block, not as a JSON
 * string — which is the substantive advantage of this path: there is no prose to strip and
 * no `JSON.parse` that can fail on an apology wrapped around the answer.
 *
 * The blocks are scanned rather than indexed: a response can lead with a `text` block even
 * when a tool call was forced.
 */
export function extractToolInput(data: unknown): unknown | null {
  if (typeof data !== "object" || data === null) return null
  const content = (data as { content?: unknown }).content
  if (!Array.isArray(content)) return null
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue
    const b = block as { type?: unknown; input?: unknown }
    if (
      b.type === "tool_use" &&
      typeof b.input === "object" &&
      b.input !== null
    ) {
      return b.input
    }
  }
  return null
}

/**
 * The provider's answer as a plain value, ready for the caller's Zod parse.
 *
 * Returning the VALUE rather than a string is what lets the two protocols meet: OpenAI
 * hands back text that has to be parsed, Anthropic hands back an object that must not be.
 * Null means "not the shape we expect", which the caller turns into `malformed` — including
 * the OpenAI case where a provider without structured-output support answers with prose
 * around the JSON, or with an apology instead of it.
 */
export function extractPayload(
  provider: AiProvider,
  data: unknown,
): unknown | null {
  if (provider === "anthropic") return extractToolInput(data)
  const content = extractContent(data)
  if (content === null) return null
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

/** User-facing copy. Each one leaves the manual path open, per ADR-0005's precedent. */
export function describeAiFailure(failure: AiFailure): string {
  switch (failure.kind) {
    case "disabled":
      return "The companion is turned off on this install."
    case "offline":
      return "Can't reach the AI provider — check this machine's internet connection."
    case "timeout":
      // A box with no internet often hangs on DNS rather than failing fast, so this is
      // at least as likely as the offline message to be what a disconnected user sees.
      return "The provider didn't answer in time. Nothing was created — try again."
    case "http":
      return failure.status === 401 || failure.status === 403
        ? "The provider rejected the API key. Check it in Settings."
        : `The provider answered ${failure.status}. Nothing was created.`
    case "malformed":
      return "The provider answered with something this app couldn't read as a plan."
  }
}
