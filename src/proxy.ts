import NextAuth from "next-auth"

import { authConfig } from "@/lib/auth.config"

// Coarse route protection (Next.js 16 "proxy", formerly middleware). Uses the
// DB-free auth.config so it stays lightweight; the authoritative session check
// also runs in the authenticated (app) layout.
const { auth } = NextAuth(authConfig)

export default auth

// `sw.js`, `offline.html` and `fonts/` are exempt for the same reason the icons and the
// manifest are: they are static files with no user data in them. They need it more, though —
// the browser refuses to register a service worker whose script answers with a redirect, and
// the worker's install-time `cache.add(…)` would follow a 307 to /login and then throw,
// because `cache.put` rejects a redirected Response. Every one of these is precached, so all
// three would fail in ways that read like nothing at all. (Measured: the font 307'd here
// before it was listed.)
//
// The first two are anchored with `$` so they match those exact paths and nothing else;
// `fonts/` is a prefix, the same shape as `_next/static`, because everything under it is by
// definition a public build asset. The extension class below is deliberately NOT widened to
// cover them: `.*\.(?:…)$` matches any ROUTE ending in those characters, not just files, so
// adding `.js`/`.html`/`.woff2` there would open up far more than a few known assets.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw\\.js$|offline\\.html$|fonts/|.*\\.(?:png|svg|ico|webmanifest)$).*)",
  ],
}
