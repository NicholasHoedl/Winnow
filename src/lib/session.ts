import "server-only"
import { cache } from "react"

import { auth } from "@/lib/auth"

/**
 * Returns the current user's id, or throws if unauthenticated. Every query and
 * action scopes its DB access to this id.
 *
 * `cache()` because this is the most-called function in the app — around twenty times
 * on one /activity render, since every query begins with it — and each call was a fresh
 * `auth()`, which decrypts the session cookie. Per-REQUEST memoization: React clears the
 * cache between requests, so this cannot serve one user's id to another's request, and it
 * cannot go stale against a sign-out.
 */
export const requireUserId = cache(async (): Promise<string> => {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  return session.user.id
})
