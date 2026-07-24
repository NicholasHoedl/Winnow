"use server"

// Client-callable entry point for the ⌘K palette. Thin wrapper over the server-only
// fan-out in queries.ts (which enforces user scoping). Returns plain, serializable
// SearchResult objects.

import { searchEverything } from "./queries"
import type { SearchResult } from "./types"

export async function search(query: string): Promise<SearchResult[]> {
  return searchEverything(query)
}
