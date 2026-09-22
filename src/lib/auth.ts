// About this file: the app's full Auth.js setup, signing a person in with an email and a
// password checked against the `users` table.
//
// What you'll find here:
// - `FAILED_SIGN_IN_FLOOR_MS` and `reject`: pad each failed attempt to the same duration,
//   then refuse it.
// - `handlers`, `auth`, `signIn`, `signOut`, `unstable_update`: what `NextAuth()` returns
//   for `authConfig` plus the Credentials provider; `handlers` backs
//   `src/app/api/auth/[...nextauth]/route.ts`.
// - The Credentials `authorize` function: checks the input with `loginSchema`, looks the
//   user up by lowercased email, and compares the password with bcrypt.
//
// Related: `src/lib/session.ts`, where `auth()` becomes the user id every query needs.

import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { users } from "@/db/schema"
import { authConfig } from "@/lib/auth.config"
import { loginSchema } from "@/lib/validations/auth"

/**
 * Minimum wall time a FAILED sign-in takes. A floor, not an added delay, and deliberately
 * paired with **no lockout** — see ADR-0018.
 *
 * The floor is doing two jobs. The obvious one is slowing repeated guesses. The other is
 * closing a user-enumeration oracle: a missing email returns before bcrypt runs (~0ms), a
 * wrong password returns after it (~100ms+), and the gap between those two is readable.
 * Padding both to the same figure closes it without a dummy hash that would have to be
 * kept in step with the real cost factor.
 *
 * A lockout was rejected rather than deferred. There is no password-reset flow here — no
 * sign-up, and `scripts/seed-user.ts` is the only thing that creates an account — so
 * locking the single account means recovering through a shell on the Postgres container.
 * On a phone, five fat-fingered attempts is an ordinary morning.
 */
const FAILED_SIGN_IN_FLOOR_MS = 500

/** Pad a failed attempt out to the floor, then reject. `null` is Auth.js's "no". */
async function reject(startedAt: number): Promise<null> {
  const remaining = FAILED_SIGN_IN_FLOOR_MS - (Date.now() - startedAt)
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining))
  }
  return null
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        // Every `return null` below goes through `reject`, so all three failure paths
        // cost the same. Adding a fourth means routing it through `reject` too.
        const startedAt = Date.now()

        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return reject(startedAt)

        const { email, password } = parsed.data
        const user = await db.query.users.findFirst({
          where: eq(users.email, email.toLowerCase()),
        })
        if (!user) return reject(startedAt)

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return reject(startedAt)

        return { id: user.id, email: user.email, name: user.displayName }
      },
    }),
  ],
})
