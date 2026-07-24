// Pure, dependency-free core of cross-module search: query normalization, LIKE-escaping,
// relevance scoring, snippeting, and the final rank+cap. No DB, no `server-only` — so it's
// directly unit-tested and safe to import anywhere. The DB fan-out lives in `queries.ts`.

import type { SearchResult } from "./types"

/** Shortest query we'll run — below this the palette shows commands instead of searching. */
export const MIN_QUERY_LENGTH = 2
/** Rows fetched per module before ranking (bounds DB work). */
export const PER_MODULE_LIMIT = 6
/** Results returned after merging + ranking across modules. */
export const TOTAL_LIMIT = 20

/**
 * Escape the SQL-LIKE metacharacters (`\`, `%`, `_`) in a user query so they match
 * literally — otherwise searching "50%" or "a_b" would behave as wildcards. Postgres
 * ILIKE uses `\` as the default escape char.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/** Trim, and return null if what's left is too short to search. */
export function normalizeQuery(raw: string): string | null {
  const q = raw.trim()
  return q.length >= MIN_QUERY_LENGTH ? q : null
}

/**
 * Relevance of `query` within `text` (case-insensitive): 3 = prefix, 2 = at a word
 * boundary, 1 = anywhere, 0 = no match.
 */
export function scoreMatch(text: string, query: string): number {
  const t = text.toLowerCase()
  const q = query.toLowerCase().trim()
  if (!q) return 0
  const idx = t.indexOf(q)
  if (idx < 0) return 0
  if (idx === 0) return 3
  return /[\s\-/.,]/.test(t[idx - 1]) ? 2 : 1
}

/** Best score across a primary field and an optional secondary one (secondary discounted). */
export function scoreResult(
  query: string,
  primary: string,
  secondary?: string | null
): number {
  const p = scoreMatch(primary, query)
  const s = secondary ? scoreMatch(secondary, query) : 0
  return Math.max(p, s * 0.4)
}

/** Collapse whitespace and truncate to `max` chars with an ellipsis. */
export function snippet(text: string, max = 100): string {
  const clean = text.replace(/\s+/g, " ").trim()
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + "…"
}

/** Sort by score (desc), tie-break by title, and cap the total. */
export function rankAndCap(
  results: SearchResult[],
  limit = TOTAL_LIMIT
): SearchResult[] {
  return [...results]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
}
