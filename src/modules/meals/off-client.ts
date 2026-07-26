import "server-only"

// The app's only outbound HTTP (ADR-0005). Everything here returns a result — nothing
// throws — because a self-hosted box will sometimes have no internet, and "the food
// database is unreachable" has to degrade to "type it in yourself", which is exactly
// the behaviour that existed before this feature.
//
// Pure protocol details (URLs, timeouts, failure copy) live in off-request.ts so they
// can be unit-tested; this module is `server-only` and the test runner can't load it.

import { OFF_API_URL, OFF_ENABLED, OFF_SEARCH_URL } from "@/lib/config"

import { mapOffProduct, type ImportedFood } from "./off-mapping"
import {
  BARCODE_TIMEOUT_MS,
  buildProductUrl,
  buildSearchUrl,
  classifyFetchError,
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  OFF_USER_AGENT,
  SEARCH_TIMEOUT_MS,
  type OffResult,
} from "./off-request"
import { isLikelyBarcode } from "./service"

/** One GET, JSON-decoded, with every way it can go wrong turned into a failure value. */
async function getJson(
  url: string,
  timeoutMs: number,
): Promise<OffResult<unknown>> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { "User-Agent": OFF_USER_AGENT, Accept: "application/json" },
      // Third-party data about someone else's products — never worth caching here.
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    return { ok: false, failure: classifyFetchError(error) }
  }

  if (!response.ok) {
    return { ok: false, failure: { kind: "http", status: response.status } }
  }

  try {
    return { ok: true, data: await response.json() }
  } catch {
    // OFF answers HTML for some error states, which is how this happens in practice.
    return { ok: false, failure: { kind: "malformed" } }
  }
}

/** Pull an array out of `key` without asserting anything about its elements. */
function arrayAt(data: unknown, key: string): unknown[] | null {
  if (typeof data !== "object" || data === null) return null
  const value = (data as Record<string, unknown>)[key]
  return Array.isArray(value) ? value : null
}

/**
 * Free-text product search. Returns only products that mapped cleanly — OFF is full of
 * stub entries created by a scan nobody finished, and they are not worth showing.
 *
 * Writes nothing. Importing is a separate, explicit action (ADR-0005).
 */
export async function searchProducts(
  query: string,
): Promise<OffResult<ImportedFood[]>> {
  if (!OFF_ENABLED) return { ok: false, failure: { kind: "disabled" } }

  const trimmed = query.trim()
  if (trimmed.length < MIN_QUERY_LENGTH || trimmed.length > MAX_QUERY_LENGTH) {
    // Too short to be meaningful, or too long to be real: answer locally rather than
    // spending someone else's rate limit on it.
    return { ok: true, data: [] }
  }

  const result = await getJson(
    buildSearchUrl(OFF_SEARCH_URL, trimmed),
    SEARCH_TIMEOUT_MS,
  )
  if (!result.ok) return result

  const hits = arrayAt(result.data, "hits")
  if (hits === null) return { ok: false, failure: { kind: "malformed" } }

  return {
    ok: true,
    data: hits
      .map(mapOffProduct)
      .filter((food): food is ImportedFood => food !== null),
  }
}

/**
 * One product by barcode. `data: null` means "reached OFF, it has no such product" —
 * a different answer from a failure, and the UI says different things about each.
 */
export async function fetchProductByBarcode(
  barcode: string,
): Promise<OffResult<ImportedFood | null>> {
  if (!OFF_ENABLED) return { ok: false, failure: { kind: "disabled" } }

  const trimmed = barcode.trim()
  // Gate BEFORE building the URL: this value becomes a path segment.
  if (!isLikelyBarcode(trimmed)) return { ok: true, data: null }

  const result = await getJson(
    buildProductUrl(OFF_API_URL, trimmed),
    BARCODE_TIMEOUT_MS,
  )
  // A 404 is deliberately NOT treated as "no such product". Live OFF answers 200 for an
  // unknown code (verified), so the only realistic way to get a 404 here is a wrong
  // OFF_API_URL — and silently reporting a misconfigured install as "product not found"
  // would make it undiagnosable.
  if (!result.ok) return result

  const body = result.data
  if (typeof body !== "object" || body === null) {
    return { ok: false, failure: { kind: "malformed" } }
  }
  // Verified against live OFF: a miss is HTTP 200 with `{"status": 0}` and NO `product`
  // key at all — so an absent product is the normal "not found", not a malformed body.
  const product = (body as Record<string, unknown>).product
  return { ok: true, data: product ? mapOffProduct(product) : null }
}
