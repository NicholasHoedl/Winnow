import "server-only"
import { randomBytes } from "node:crypto"

/**
 * A new subscribe-feed token. The first use of `crypto` anywhere in `src/`.
 *
 * 256 bits from the OS CSPRNG, base64url so it survives being a path segment untouched.
 * Random rather than derived from the account: a token computed from the user id or a
 * secret would be reproducible, and this one has to be revocable by replacement.
 *
 * `randomBytes`, not `Math.random` — the latter is not a CSPRNG and this is a credential,
 * which is the whole reason this is a named function rather than one inline line.
 */
export function newFeedToken(): string {
  return randomBytes(32).toString("base64url")
}
