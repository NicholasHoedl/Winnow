import "server-only"

import { auth } from "@/lib/auth"

/** Returns the current user's id, or throws if unauthenticated. Every query and
 * action scopes its DB access to this id. */
export async function requireUserId(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  return session.user.id
}
