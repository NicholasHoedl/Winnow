import "server-only"
import { z } from "zod"

import {
  AI_API_KEY,
  AI_BASE_URL,
  AI_MODEL,
  AI_PROVIDER,
  AI_READY,
} from "@/lib/config"

import {
  buildRequestBody,
  buildRequestHeaders,
  buildRequestUrl,
  classifyFetchError,
  extractPayload,
  GENERATE_TIMEOUT_MS,
  type AiResult,
} from "./ai-request"
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
  if (!AI_READY) return { ok: false, failure: { kind: "disabled" } }

  let response: Response
  try {
    response = await fetch(buildRequestUrl(AI_PROVIDER, AI_BASE_URL), {
      method: "POST",
      // URL, headers and body all vary by provider — see `AiProvider` in ai-request.ts for
      // why Anthropic is a second protocol rather than a base-URL swap.
      headers: buildRequestHeaders(AI_PROVIDER, AI_API_KEY),
      body: JSON.stringify(
        buildRequestBody(
          AI_PROVIDER,
          AI_MODEL,
          messages,
          z.toJSONSchema(schema),
        ),
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
  const parsed = extractPayload(AI_PROVIDER, body)
  if (parsed === null) return { ok: false, failure: { kind: "malformed" } }

  const result = schema.safeParse(parsed)
  if (!result.success) return { ok: false, failure: { kind: "malformed" } }

  return { ok: true, data: result.data }
}

/** Which model produced a proposal, recorded on the row so a bad run can be traced. */
export function currentModel(): string {
  return AI_MODEL
}
