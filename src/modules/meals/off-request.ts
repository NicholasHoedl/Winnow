// The Open Food Facts wire protocol: URL shapes, headers, and the failure taxonomy.
// Pure and dependency-free so it can be unit-tested — off-client.ts is `server-only`
// and therefore can't be imported by the test runner at all.
//
// Every URL shape here was verified against the live service; see the notes on each.

/** Why a call didn't produce data. Never an exception — see ADR-0005. */
export type OffFailure =
  /** OFF_ENABLED=false. The UI hides the feature rather than showing a dead search. */
  | { kind: "disabled" }
  /** DNS/connect failed. Expected on a self-hosted box with no internet. */
  | { kind: "offline" }
  | { kind: "timeout" }
  | { kind: "http"; status: number }
  /** Reached it, but the body wasn't the shape we expect. */
  | { kind: "malformed" }

export type OffResult<T> =
  { ok: true; data: T } | { ok: false; failure: OffFailure }

/** OFF asks callers to identify themselves; generic agents get rate-limited harder. */
export const OFF_USER_AGENT = "Winnow/0.1 (self-hosted personal tracker)"

/**
 * Requesting specific fields is not an optimization, it's a requirement: a full OFF
 * product document is ~100 KB, and the same search trimmed to these fields is ~600
 * bytes per hit (measured: 51,400 → 1,770 bytes for three products).
 */
export const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "generic_name",
  "brands",
  "quantity",
  "serving_size",
  "nutrition_data_per",
  "nutriments",
].join(",")

/** How many hits to ask for. The dialog's list is short; more is just bytes. */
export const OFF_PAGE_SIZE = 12

/** Below this a query matches half the database and the results are noise. */
export const MIN_QUERY_LENGTH = 2
export const MAX_QUERY_LENGTH = 100

/** Search is a background keystroke; a barcode lookup is a person at a shelf waiting. */
export const SEARCH_TIMEOUT_MS = 6000
export const BARCODE_TIMEOUT_MS = 4000

/**
 * Full-text search. NOT `world.openfoodfacts.org` — that host's `/api/v2/search` accepts
 * `search_terms` and then ignores it, happily returning the entire 4.6M-product database
 * in arbitrary order, and its `/cgi/search.pl` currently answers 503. Text search lives
 * on the separate search service, which is the only one of the three that returned
 * anything relevant for "greek yogurt".
 */
export function buildSearchUrl(baseUrl: string, query: string): string {
  const params = new URLSearchParams({
    q: query,
    page_size: String(OFF_PAGE_SIZE),
    fields: OFF_FIELDS,
  })
  return `${trimSlash(baseUrl)}/search?${params}`
}

/**
 * One product by barcode. The code goes into a PATH SEGMENT, so it must already be
 * digits-only — {@link isLikelyBarcode} in service.ts is the gate, and callers run it
 * before this. `encodeURIComponent` is belt-and-braces on top of that.
 */
export function buildProductUrl(baseUrl: string, barcode: string): string {
  const params = new URLSearchParams({ fields: OFF_FIELDS })
  return `${trimSlash(baseUrl)}/api/v2/product/${encodeURIComponent(barcode)}.json?${params}`
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

/**
 * Turn a thrown fetch error into a failure kind. Only ever sees transport-level errors:
 * a non-2xx response and an unparseable body are handled by the caller as `http` and
 * `malformed` respectively.
 *
 * Undici wraps the real cause, so the OS error code lives on `error.cause.code`.
 * Anything unrecognised is reported as `offline`, because a fetch that throws at all
 * means the request never completed — and "can't reach it" is the honest summary.
 */
export function classifyFetchError(error: unknown): OffFailure {
  const name = error instanceof Error ? error.name : ""
  if (name === "TimeoutError" || name === "AbortError")
    return { kind: "timeout" }
  return { kind: "offline" }
}

/** User-facing copy. Each one has to leave the door open to typing the food in by hand. */
export function describeOffFailure(failure: OffFailure): string {
  switch (failure.kind) {
    case "disabled":
      return "The food database is turned off on this install."
    case "offline":
      return "Can't reach the food database — check this machine's internet connection."
    case "timeout":
      // Measured: a box with no internet often HANGS on DNS rather than failing fast,
      // so this message is at least as likely as the offline one to be what a
      // disconnected user sees. It has to point at connectivity too.
      return "The food database didn't answer in time — it may be busy, or this machine may be offline."
    case "http":
      return failure.status === 429
        ? "The food database is rate-limiting us. Give it a moment."
        : `The food database returned an error (${failure.status}).`
    case "malformed":
      return "The food database sent something unexpected."
  }
}
