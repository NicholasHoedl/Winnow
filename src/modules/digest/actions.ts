"use server"

// Client-callable entry point for the digest banner. The banner asks for this only
// once a day (when it detects a new local date), so the three aggregations behind it
// don't run on every navigation.

import { computeDigest } from "./queries"
import type { Digest } from "./service"

export async function getDigest(): Promise<Digest | null> {
  return computeDigest()
}
