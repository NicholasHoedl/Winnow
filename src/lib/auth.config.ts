import type { NextAuthConfig } from "next-auth"

// Edge/Node-safe base config: no database or bcrypt imports, so it can be used
// by the proxy (middleware) for coarse route protection. The Credentials
// provider (which needs the DB) is added in auth.ts.
export const authConfig = {
  /**
   * Thirty days, rolling — stated rather than inherited.
   *
   * **This is deliberately NOT a user preference**, and the reason is structural rather than
   * a judgement about how long a session should be. This object is passed to `NextAuth()`
   * once at module load, by `auth.ts` and again by the proxy, and `maxAge` is read from it to
   * compute the cookie's expiry. There is no per-request hook that could substitute a value
   * read from `user_preferences`, so "session length" cannot be a row in that table without
   * restructuring how the config is built.
   *
   * What it CAN be is explicit. The value was previously unstated, which meant the real
   * session length was whatever Auth.js defaulted to that week — a thing nobody could answer
   * without reading the dependency. `updateAge` refreshes the token a day into use, so daily
   * use never expires and a genuinely idle month signs you out.
   *
   * Thirty days suits this app specifically: one user, a private tailnet as the perimeter
   * (ADR-0002), and a phone opened many times a day where a surprise re-authentication is
   * the most annoying thing the app could do.
   */
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const isOnLogin = request.nextUrl.pathname.startsWith("/login")

      if (isOnLogin) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", request.nextUrl))
        }
        return true
      }
      // Everything else requires a session.
      return isLoggedIn
    },
    jwt({ token, user, trigger, session }) {
      if (user) token.id = user.id
      // Profile edits call unstable_update({ user: { name } }); merge it into the
      // token so session.user.name refreshes without a re-login.
      if (trigger === "update" && typeof session?.user?.name === "string") {
        token.name = session.user.name
      }
      return token
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
} satisfies NextAuthConfig
