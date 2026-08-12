import "server-only"
import { z } from "zod"

import { getAiConfig } from "@/modules/preferences/queries"

import {
  buildModelsUrl,
  buildRequestBody,
  buildRequestHeaders,
  buildRequestUrl,
  classifyFetchError,
  extractModels,
  extractPayload,
  GENERATE_TIMEOUT_MS,
  MODELS_TIMEOUT_MS,
  type AiModel,
  type AiResult,
} from "./ai-request"
import {
  aiReady,
  resolveBaseUrl,
  wireProtocol,
  type AiProviderChoice,
} from "./ai-settings"
import type { ChatMessage } from "./service"

// The second outbound call in the codebase, after Open Food Facts. Same rule, for the
// same reason: nothing here throws. A provider outage, an expired key or a model that
// answers with prose all have to arrive at the UI as something it can render next to a
// still-usable manual path — see ADR-0005 for the pattern and ADR-0011 for this feature's
// own boundary.

/**
 * Ask for a payload of whatever shape the caller wants, and validate it against that same
 * shape on the way back.
 *
 * Generic over the schema so each job (a plan, a routine, and later a summary) supplies
 * its own without a second copy of the transport. The JSON Schema handed to the provider
 * is DERIVED from the Zod schema rather than written out again — two hand-maintained
 * copies of one shape is the exact failure `account/coverage.test.ts` exists to catch
 * elsewhere in this repo.
 *
 * The answer is parsed with the same schema that generated the instructions, so "the
 * provider ignored the schema" and "the provider does not support structured output" both
 * land as `malformed` rather than as a surprise several layers down.
 */
export async function generatePayload<T>(
  schema: z.ZodType<T>,
  messages: ChatMessage[],
): Promise<AiResult<T>> {
  // Read per request, not per process: the settings page can change any of this between
  // one generation and the next, and a module constant would serve the value the server
  // booted with until it was restarted.
  const config = await getAiConfig()
  if (!aiReady(config)) return { ok: false, failure: { kind: "disabled" } }

  // The stored value is what the user PICKED; the request builders want a wire protocol.
  // `custom` is an OpenAI-compatible endpoint at an address they supplied, so it resolves
  // to the same protocol as `openai` — see `wireProtocol`.
  const wire = wireProtocol(config.provider)

  let response: Response
  try {
    response = await fetch(buildRequestUrl(wire, config.baseUrl), {
      method: "POST",
      // URL, headers and body all vary by provider — see `AiProvider` in ai-request.ts for
      // why Anthropic is a second protocol rather than a base-URL swap.
      headers: buildRequestHeaders(wire, config.apiKey),
      body: JSON.stringify(
        buildRequestBody(wire, config.model, messages, z.toJSONSchema(schema)),
      ),
      cache: "no-store",
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, failure: classifyFetchError(error) }
  }

  if (!response.ok) {
    return { ok: false, failure: { kind: "http", status: response.status } }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, failure: { kind: "malformed" } }
  }

  // Already a value, not text: the OpenAI path parses the JSON string inside
  // `extractPayload`, the Anthropic path reads the forced tool call's input directly.
  const parsed = extractPayload(wire, body)
  if (parsed === null) return { ok: false, failure: { kind: "malformed" } }

  const result = schema.safeParse(parsed)
  if (!result.success) return { ok: false, failure: { kind: "malformed" } }

  return { ok: true, data: result.data }
}

/** Which model produced a proposal, recorded on the row so a bad run can be traced. */
export async function currentModel(): Promise<string> {
  return (await getAiConfig()).model
}

/**
 * Ask the configured provider what models it serves, for the Settings dropdown.
 *
 * Deliberately NOT gated on `aiReady`. That requires a model to already be set, and the
 * entire point of this call is to choose one — gating on it would mean the dropdown only
 * worked once you had typed a model in by hand, which is the thing being removed. It needs
 * a base URL and nothing else.
 *
 * The API key is not required either, for the same reason `buildRequestHeaders` omits it
 * when unset: a self-hosted endpoint usually wants no auth. A hosted provider will answer
 * 401 without one, which arrives as `http` and is a truer message than a guess made here.
 */
export async function fetchModels(
  /**
   * The provider being CONSIDERED, when that is not the one saved.
   *
   * The Settings form asks for a model list before it saves, and a fetch that read only
   * stored settings would answer for the previous provider — offering Anthropic's models
   * to someone who has just switched to OpenAI and not yet pressed Save. The API key is
   * never part of this: it always comes from storage, so a caller cannot use this to
   * exfiltrate it by naming an endpoint of their own... which they CAN, by choosing
   * `custom`. That is a deliberate capability of the feature, not a hole — pointing the
   * companion at your own server is the entire purpose of that option, and the key goes
   * wherever the companion goes.
   */
  override?: { provider: AiProviderChoice; baseUrl: string },
): Promise<AiResult<AiModel[]>> {
  const config = await getAiConfig()
  const provider = override?.provider ?? config.provider
  const baseUrl = resolveBaseUrl(provider, override?.baseUrl ?? config.baseUrl)
  if (baseUrl === "") {
    return { ok: false, failure: { kind: "disabled" } }
  }

  const wire = wireProtocol(provider)
  let response: Response
  try {
    response = await fetch(buildModelsUrl(baseUrl), {
      headers: buildRequestHeaders(wire, config.apiKey),
      cache: "no-store",
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, failure: classifyFetchError(error) }
  }

  if (!response.ok) {
    return { ok: false, failure: { kind: "http", status: response.status } }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, failure: { kind: "malformed" } }
  }

  const models = extractModels(body)
  if (models === null) return { ok: false, failure: { kind: "malformed" } }
  return { ok: true, data: models }
}
