import NextAuth from "next-auth"

import { authConfig } from "@/lib/auth.config"

// Coarse route protection (Next.js 16 "proxy", formerly middleware). Uses the
// DB-free auth.config so it stays lightweight; the authoritative session check
// also runs in the authenticated (app) layout.
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webmanifest)$).*)",
  ],
}
