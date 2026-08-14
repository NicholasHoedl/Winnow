// Shared shape for a single cross-module search hit. Deliberately flat + serializable
// (no Date objects) so it crosses the server-action boundary and renders directly in the
// ⌘K palette. `href` is where selecting the result navigates.

export type SearchResultType =
  "task" | "event" | "food" | "transaction" | "goal" | "habit"

export type SearchResult = {
  type: SearchResultType
  id: string
  /** Primary label (task/event/goal title, food name, transaction description). */
  title: string
  /** Secondary context line (a notes snippet, a serving label). */
  subtitle?: string
  /** A display date (YYYY-MM-DD) when the item has one; null/omitted otherwise. */
  date?: string | null
  /** Destination when the result is chosen. */
  href: string
  /** Ranking score; higher sorts first. Computed by the pure service. */
  score: number
}
