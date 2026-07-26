import { describe, expect, it } from "vitest"

import {
  buildProductUrl,
  buildSearchUrl,
  classifyFetchError,
  describeOffFailure,
  OFF_PAGE_SIZE,
} from "./off-request"

describe("buildSearchUrl", () => {
  it("hits the search service's /search with the query as `q`", () => {
    const url = new URL(
      buildSearchUrl("https://search.openfoodfacts.org", "oats"),
    )
    expect(url.pathname).toBe("/search")
    expect(url.searchParams.get("q")).toBe("oats")
    expect(url.searchParams.get("page_size")).toBe(String(OFF_PAGE_SIZE))
  })

  it("always requests a field list — a full product document is ~100 KB", () => {
    const url = new URL(buildSearchUrl("https://x.test", "oats"))
    expect(url.searchParams.get("fields")).toContain("nutriments")
    expect(url.searchParams.get("fields")).toContain("code")
  })

  it("encodes a query that would otherwise break the URL", () => {
    const url = new URL(buildSearchUrl("https://x.test", "a&b=c d#e?f"))
    // Round-tripping through URLSearchParams is the actual guarantee.
    expect(url.searchParams.get("q")).toBe("a&b=c d#e?f")
  })

  it("tolerates a trailing slash on the base URL", () => {
    expect(buildSearchUrl("https://x.test/", "oats")).toContain(
      "https://x.test/search?",
    )
  })
})

describe("buildProductUrl", () => {
  it("puts the barcode in the path with a .json suffix", () => {
    const url = new URL(
      buildProductUrl("https://world.openfoodfacts.org", "3017620422003"),
    )
    expect(url.pathname).toBe("/api/v2/product/3017620422003.json")
    expect(url.searchParams.get("fields")).toContain("nutriments")
  })

  it("encodes the path segment — this value reaches a URL path", () => {
    // isLikelyBarcode is the real gate; this is the second line of defence, so it
    // must not be possible to walk out of the path even if the gate were bypassed.
    const url = buildProductUrl("https://x.test", "../../etc/passwd")
    expect(url).not.toContain("../")
    expect(url).toContain("%2F")
  })
})

describe("classifyFetchError", () => {
  it("reads an abort as a timeout", () => {
    const err = new Error("The operation was aborted")
    err.name = "TimeoutError"
    expect(classifyFetchError(err).kind).toBe("timeout")

    const abort = new Error("aborted")
    abort.name = "AbortError"
    expect(classifyFetchError(abort).kind).toBe("timeout")
  })

  it("reports anything else as offline — a throwing fetch never completed", () => {
    expect(classifyFetchError(new TypeError("fetch failed")).kind).toBe(
      "offline",
    )
    expect(classifyFetchError("nonsense").kind).toBe("offline")
    expect(classifyFetchError(undefined).kind).toBe("offline")
  })
})

describe("describeOffFailure", () => {
  it("gives every failure a message that leaves hand-entry open", () => {
    const kinds = [
      { kind: "disabled" } as const,
      { kind: "offline" } as const,
      { kind: "timeout" } as const,
      { kind: "http", status: 500 } as const,
      { kind: "malformed" } as const,
    ]
    for (const failure of kinds) {
      expect(describeOffFailure(failure).length).toBeGreaterThan(10)
    }
  })

  it("names rate-limiting specifically, since waiting is the fix", () => {
    expect(describeOffFailure({ kind: "http", status: 429 })).toMatch(
      /rate-limit/i,
    )
  })

  it("includes the status code for other HTTP errors", () => {
    expect(describeOffFailure({ kind: "http", status: 503 })).toContain("503")
  })
})
