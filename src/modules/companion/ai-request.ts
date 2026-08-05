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
  /** AI_ENABLED is off, or the base URL / model is unset. The UI hides the feature. */
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

export function buildChatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`
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
        ? "The provider rejected the API key. Check AI_API_KEY."
        : `The provider answered ${failure.status}. Nothing was created.`
    case "malformed":
      return "The provider answered with something this app couldn't read as a plan."
  }
}
