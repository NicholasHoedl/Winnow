"use server"

// Client-callable entry point for the ⌘K palette. Thin wrapper over the server-only
// fan-out in queries.ts (which enforces user scoping). Returns plain, serializable
// SearchResult objects.

import { z } from "zod"

import { searchEverything } from "./queries"
import type { SearchResult } from "./types"

export async function search(query: string): Promise<SearchResult[]> {
  // Guard the RPC boundary: a malformed (non-string) arg yields no results rather than a
  // 500. User scoping + LIKE-escaping still happen downstream in queries.ts / service.ts.
  const parsed = z.string().safeParse(query)
  if (!parsed.success) return []
  return searchEverything(parsed.data)
}
