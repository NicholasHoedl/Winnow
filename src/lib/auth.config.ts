import type { NextAuthConfig } from "next-auth"

// Edge/Node-safe base config: no database or bcrypt imports, so it can be used
// by the proxy (middleware) for coarse route protection. The Credentials
// provider (which needs the DB) is added in auth.ts.
export const authConfig = {
  session: { strategy: "jwt" },
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
