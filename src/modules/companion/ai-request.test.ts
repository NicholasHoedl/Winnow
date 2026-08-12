import { describe, expect, it } from "vitest"

import {
  buildAnthropicBody,
  buildChatBody,
  buildModelsUrl,
  buildRequestBody,
  buildRequestHeaders,
  buildRequestUrl,
  describeAiFailure,
  extractModels,
  extractPayload,
  extractToolInput,
  MAX_OUTPUT_TOKENS,
} from "./ai-request"
import type { ChatMessage } from "./service"

/**
 * The wire protocol, both dialects.
 *
 * This file exists because the module gained a SECOND protocol. Everything here was
 * previously covered only by `e2e/companion.spec.ts` through a stub that speaks OpenAI —
 * which by construction can never exercise the Anthropic path at all. The e2e proves the
 * feature works end to end against one provider; these prove the request this app would
 * actually put on the wire for the other, without spending a call to find out.
 */

const MESSAGES: ChatMessage[] = [
  { role: "system", content: "You break a goal into milestones." },
  { role: "user", content: "Goal: learn to swim." },
]

const SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: { milestones: { type: "array" } },
  required: ["milestones"],
  additionalProperties: false,
}

describe("buildRequestUrl", () => {
  it("appends each provider's own path", () => {
    expect(buildRequestUrl("openai", "https://api.example.com/v1")).toBe(
      "https://api.example.com/v1/chat/completions",
    )
    expect(buildRequestUrl("anthropic", "https://api.anthropic.com/v1")).toBe(
      "https://api.anthropic.com/v1/messages",
    )
  })

  it("tolerates trailing slashes, which people paste", () => {
    expect(
      buildRequestUrl("anthropic", "https://api.anthropic.com/v1///"),
    ).toBe("https://api.anthropic.com/v1/messages")
  })
})

describe("buildRequestHeaders", () => {
  it("uses bearer auth for openai", () => {
    const headers = buildRequestHeaders("openai", "sk-test")
    expect(headers.Authorization).toBe("Bearer sk-test")
    expect(headers["x-api-key"]).toBeUndefined()
  })

  it("uses x-api-key AND the version header for anthropic", () => {
    const headers = buildRequestHeaders("anthropic", "sk-ant-test")
    expect(headers["x-api-key"]).toBe("sk-ant-test")
    // Not optional: the request is rejected without it, which would surface as a bare
    // `http 400` with nothing pointing at the cause.
    expect(headers["anthropic-version"]).toBeTruthy()
    expect(headers.Authorization).toBeUndefined()
  })

  it("omits the credential entirely when there is no key", () => {
    // A local endpoint usually wants no auth, and some reject an empty one outright.
    expect(buildRequestHeaders("openai", "").Authorization).toBeUndefined()
    expect(buildRequestHeaders("anthropic", "")["x-api-key"]).toBeUndefined()
    // The version header is about the API, not the caller, so it stays.
    expect(
      buildRequestHeaders("anthropic", "")["anthropic-version"],
    ).toBeTruthy()
  })
})

describe("buildAnthropicBody", () => {
  it("hoists the system prompt out of the message list", () => {
    const body = buildAnthropicBody("claude-sonnet-5", MESSAGES, SCHEMA)
    // Anthropic rejects role:"system" inside messages — this is the difference most likely
    // to be reintroduced by someone copying the OpenAI builder.
    expect(body.system).toBe("You break a goal into milestones.")
    expect(body.messages).toEqual([
      { role: "user", content: "Goal: learn to swim." },
    ])
  })

  it("joins multiple system messages rather than dropping any", () => {
    const body = buildAnthropicBody(
      "claude-sonnet-5",
      [
        { role: "system", content: "First." },
        { role: "system", content: "Second." },
        { role: "user", content: "Go." },
      ],
      SCHEMA,
    )
    expect(body.system).toBe("First.\n\nSecond.")
  })

  it("omits `system` when there is none, rather than sending an empty string", () => {
    const body = buildAnthropicBody(
      "claude-sonnet-5",
      [{ role: "user", content: "Go." }],
      SCHEMA,
    )
    expect("system" in body).toBe(false)
  })

  it("always sends max_tokens, which anthropic requires", () => {
    const body = buildAnthropicBody("claude-sonnet-5", MESSAGES, SCHEMA)
    expect(body.max_tokens).toBe(MAX_OUTPUT_TOKENS)
  })

  it("never sends temperature, which current Claude models reject", () => {
    // Not a style preference. A real request returned
    //   400 invalid_request_error: `temperature` is deprecated for this model
    // and every companion job failed with a bare "The provider answered 400".
    const body = buildAnthropicBody("claude-sonnet-5", MESSAGES, SCHEMA)
    expect("temperature" in body).toBe(false)
  })

  it("forces the tool call, and names the tool it forces", () => {
    const body = buildAnthropicBody("claude-sonnet-5", MESSAGES, SCHEMA)
    const tools = body.tools as { name: string; input_schema: unknown }[]
    const choice = body.tool_choice as { type: string; name: string }
    // A mismatch here is the whole feature silently degrading to prose: the model answers
    // in text, `extractToolInput` returns null, and every generation reads as `malformed`.
    expect(choice.type).toBe("tool")
    expect(choice.name).toBe(tools[0].name)
    expect(tools).toHaveLength(1)
  })

  it("strips $schema from the tool's input schema", () => {
    const body = buildAnthropicBody("claude-sonnet-5", MESSAGES, SCHEMA)
    const tools = body.tools as { input_schema: Record<string, unknown> }[]
    expect(tools[0].input_schema.$schema).toBeUndefined()
    // ...and keeps everything that actually constrains the answer.
    expect(tools[0].input_schema.required).toEqual(["milestones"])
    expect(tools[0].input_schema.additionalProperties).toBe(false)
  })
})

describe("buildRequestBody", () => {
  it("dispatches to the matching builder", () => {
    expect(buildRequestBody("openai", "gpt", MESSAGES, SCHEMA)).toEqual(
      buildChatBody("gpt", MESSAGES, SCHEMA),
    )
    expect(
      buildRequestBody("anthropic", "claude-sonnet-5", MESSAGES, SCHEMA),
    ).toEqual(buildAnthropicBody("claude-sonnet-5", MESSAGES, SCHEMA))
  })

  it("keeps temperature on the openai body", () => {
    // The two protocols genuinely disagree here — dropping it from Anthropic must not
    // quietly drop it from the path where it is wanted.
    expect(buildChatBody("gpt", MESSAGES, SCHEMA).temperature).toBe(0.4)
  })

  it("leaves the openai body's system message in place", () => {
    // The two protocols disagree about this, and the OpenAI one must not drift toward the
    // Anthropic shape now that they share a dispatcher.
    const body = buildChatBody("gpt", MESSAGES, SCHEMA)
    expect(body.messages).toEqual(MESSAGES)
    expect("system" in body).toBe(false)
  })
})

describe("extractPayload", () => {
  it("parses the JSON string an openai response carries", () => {
    const response = {
      choices: [{ message: { content: '{"milestones":[1,2]}' } }],
    }
    expect(extractPayload("openai", response)).toEqual({ milestones: [1, 2] })
  })

  it("rejects openai prose wrapped around the answer", () => {
    // A provider that ignored `response_format` lands here. The design accepts this as a
    // visible failure rather than trying to salvage JSON out of the text.
    const response = {
      choices: [{ message: { content: "Sure! Here you go: {...}" } }],
    }
    expect(extractPayload("openai", response)).toBeNull()
  })

  it("reads the tool call's input from an anthropic response, unparsed", () => {
    const response = {
      content: [{ type: "tool_use", name: "emit", input: { milestones: [1] } }],
    }
    expect(extractPayload("anthropic", response)).toEqual({ milestones: [1] })
  })

  it("finds the tool call behind a leading text block", () => {
    // A forced tool call can still be preceded by commentary; indexing [0] would miss it.
    const response = {
      content: [
        { type: "text", text: "Let me plan that." },
        { type: "tool_use", name: "emit", input: { milestones: [] } },
      ],
    }
    expect(extractPayload("anthropic", response)).toEqual({ milestones: [] })
  })

  it("returns null when anthropic answered without calling the tool", () => {
    const response = { content: [{ type: "text", text: "I can't do that." }] }
    expect(extractPayload("anthropic", response)).toBeNull()
    expect(extractToolInput(response)).toBeNull()
  })

  it("survives junk from either provider without throwing", () => {
    for (const junk of [null, undefined, 42, "text", {}, { content: {} }]) {
      expect(extractPayload("openai", junk)).toBeNull()
      expect(extractPayload("anthropic", junk)).toBeNull()
    }
  })

  it("normalises both protocols to the same value", () => {
    // The point of the dispatcher: one caller, one Zod parse, two wire formats.
    const openai = extractPayload("openai", {
      choices: [{ message: { content: '{"a":1}' } }],
    })
    const anthropic = extractPayload("anthropic", {
      content: [{ type: "tool_use", name: "emit", input: { a: 1 } }],
    })
    expect(openai).toEqual(anthropic)
  })
})

describe("describeAiFailure", () => {
  it("points at the key for an auth rejection, and says where to fix it", () => {
    // "Settings", not an env var name: T11 moved the key into the app, and a message
    // naming a variable that no longer exists sends someone to edit the wrong thing.
    for (const status of [401, 403]) {
      const copy = describeAiFailure({ kind: "http", status })
      expect(copy).toContain("API key")
      expect(copy).toContain("Settings")
      expect(copy).not.toContain("AI_API_KEY")
    }
  })

  it("says nothing was created, for every failure that reached the provider", () => {
    expect(describeAiFailure({ kind: "timeout" })).toContain(
      "Nothing was created",
    )
    expect(describeAiFailure({ kind: "http", status: 500 })).toContain(
      "Nothing was created",
    )
  })
})

describe("buildModelsUrl", () => {
  it("appends /models and tolerates a trailing slash", () => {
    expect(buildModelsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/models",
    )
    expect(buildModelsUrl("http://127.0.0.1:11434/v1//")).toBe(
      "http://127.0.0.1:11434/v1/models",
    )
  })
})

describe("extractModels", () => {
  it("reads an OpenAI-compatible list, labelling by id", () => {
    const models = extractModels({
      object: "list",
      data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }],
    })
    expect(models).toEqual([
      { id: "gpt-4o", label: "gpt-4o" },
      { id: "gpt-4o-mini", label: "gpt-4o-mini" },
    ])
  })

  it("prefers Anthropic's display_name when it sends one", () => {
    const models = extractModels({
      data: [{ type: "model", id: "claude-x", display_name: "Claude X" }],
    })
    expect(models).toEqual([{ id: "claude-x", label: "Claude X" }])
  })

  it("sorts by label, so the order does not shift between calls", () => {
    const models = extractModels({
      data: [{ id: "zeta" }, { id: "alpha" }, { id: "mid" }],
    })
    expect(models?.map((m) => m.id)).toEqual(["alpha", "mid", "zeta"])
  })

  // An endpoint that answered properly and serves nothing is a different fact from one
  // that answered with rubbish, and the form says different things about them.
  it("keeps an empty list distinct from an unusable body", () => {
    expect(extractModels({ data: [] })).toEqual([])
    expect(extractModels({ models: ["gpt-4o"] })).toBeNull()
    expect(extractModels("not json at all")).toBeNull()
    expect(extractModels(null)).toBeNull()
  })

  it("skips entries with no usable id rather than failing the whole list", () => {
    const models = extractModels({
      data: [{ id: "good" }, { id: "" }, { name: "no id" }, null, 7],
    })
    expect(models).toEqual([{ id: "good", label: "good" }])
  })
})
