// About this file: the server-only helper that answers "who is signed in?" for data
// queries and Server Actions.
//
// What you'll find here:
// - `requireUserId`: the current user's id, read from the session once per request;
//   throws when nobody is signed in.
//
// Related: `src/lib/auth.ts`, which builds the `auth()` this reads.

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
