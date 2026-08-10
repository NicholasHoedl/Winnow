import { describe, expect, it } from "vitest"

import { aiReady, maskApiKey, toProvider, type AiSettings } from "./ai-settings"

const CONFIGURED: AiSettings = {
  enabled: true,
  provider: "anthropic",
  baseUrl: "https://api.anthropic.com/v1",
  model: "claude-sonnet-5",
}

describe("aiReady", () => {
  it("needs the feature on AND configured", () => {
    expect(aiReady(CONFIGURED)).toBe(true)
    expect(aiReady({ ...CONFIGURED, enabled: false })).toBe(false)
    expect(aiReady({ ...CONFIGURED, baseUrl: "" })).toBe(false)
    expect(aiReady({ ...CONFIGURED, model: "" })).toBe(false)
  })

  it("does NOT require an API key", () => {
    // A local endpoint usually wants no auth at all, and ADR-0011 keeps that one setting
    // away. Requiring a key here would make a self-hosted model impossible to point at.
    expect(aiReady(CONFIGURED)).toBe(true)
  })
})

describe("toProvider", () => {
  it("narrows a stored string", () => {
    expect(toProvider("anthropic")).toBe("anthropic")
    expect(toProvider("openai")).toBe("openai")
  })

  it("treats anything unrecognised as the common case", () => {
    // The column is plain text so a third provider needs no migration — which means an
    // import or a hand-edited row can hold anything. An unknown value must not reach the
    // request builder, where it would produce an unexplained 400.
    for (const junk of ["", "ANTHROPIC", "claude", "gpt-4", "null"]) {
      expect(toProvider(junk)).toBe("openai")
    }
  })
})

describe("maskApiKey", () => {
  it("says nothing when there is no key", () => {
    expect(maskApiKey("")).toBeNull()
  })

  it("shows the TAIL, which is what tells two keys apart", () => {
    // Providers print a long identifying prefix, so masking from the front would reveal
    // nothing distinguishing while looking like it did.
    expect(maskApiKey("sk-ant-api03-abcdefgh4f2a")).toBe("••••4f2a")
  })

  it("reveals nothing at all from a short key", () => {
    expect(maskApiKey("short")).toBe("••••")
    expect(maskApiKey("12345678")).toBe("••••")
  })

  it("never contains the key itself", () => {
    const key = "sk-ant-api03-verysecretvalue"
    const masked = maskApiKey(key)
    expect(masked).not.toBeNull()
    expect(key.includes(masked!.replace(/•/g, ""))).toBe(true) // the tail is from the key
    expect(masked).not.toContain("verysecret")
    expect(masked!.replace(/•/g, "").length).toBeLessThanOrEqual(4)
  })
})
