import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"

/**
 * Content Security Policy.
 *
 * **This is the pragmatic policy, not the strict one, and the difference is `'unsafe-inline'`
 * on `script-src`.** Removing it needs a nonce generated per request in `proxy.ts` and
 * threaded through both Next's own bootstrap scripts and next-themes' blocking
 * apply-the-theme-before-paint script. That is a change to the request path in an app that
 * is already sensitive about streaming and Suspense boundaries, so it is deliberately not
 * bundled with a header block. Judge this policy as "closes the easy holes", not as XSS
 * defence in depth.
 *
 * Three entries are load-bearing and easy to break by tightening carelessly:
 *
 * - **`worker-src 'self'`** — `public/sw.js`. The service worker only registers in
 *   production over HTTPS, so a CSP that blocked it would pass dev AND pass the normal e2e
 *   suite (which runs against `next dev`) and only surface on the deployed phone. Explicit
 *   rather than leaning on the `default-src` fallback, because that is a failure nothing
 *   here can see.
 * - **`img-src`/`media-src blob:`** — the barcode scanner's camera frames (`@zxing/browser`).
 * - **`connect-src 'self'`** — every outbound call this app makes is SERVER-side: Open Food
 *   Facts from a Server Action (ADR-0005), the AI provider from a route handler (ADR-0012).
 *   The browser only ever talks to this origin, so no third-party host belongs here. If a
 *   client-side fetch to a third party is ever added, this line is what will reject it —
 *   which is the intended pressure.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-eval' is Turbopack's HMR and is dev-only; see the note above for 'unsafe-inline'.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  // ws: is the dev server's HMR socket.
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          // Duplicates `frame-ancestors` for browsers that predate it. Cheap, and this app
          // is never framed by anything.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          /**
           * **`camera=(self)` is required, not permissive.** The meals module scans
           * barcodes with the device camera (`barcode-scanner-dialog.tsx`, ADR-0005), so
           * the reflexive `camera=()` would silently break a shipped feature — and only on
           * the phone, which is the one surface no test here reaches.
           */
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ]
  },
  // Self-contained server bundle for the Docker image (Checkpoint 0.4 deploy).
  output: "standalone",
  // Normally `.next`. The e2e suite starts its OWN dev server (against the test database)
  // and sets this to `.next-e2e`, so the two processes do not race on the same build
  // artifacts while both are running. Nothing else sets it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin the workspace root so Next doesn't infer it from stray lockfiles
  // higher up the filesystem (e.g. a package-lock.json in the home dir).
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      // `/today` was its own route until its agenda was folded into the dashboard. The
      // app is installed to a home screen and the digest banner linked here, so a bare
      // 404 would be a dead icon on a device this repo can't reach to fix.
      { source: "/today", destination: "/", permanent: true },
      // `/todos` merged into `/activity` (ADR-0013). Same reasoning as `/today`, and more
      // of it: it was a TOP-LEVEL NAV entry for the whole life of the app, so it is among
      // the most likely things to be bookmarked, pinned, or sitting in an installed
      // shell's history on a phone this repo cannot reach.
      //
      // `/goals` was here too and is not any more — see below.
      { source: "/todos", destination: "/activity", permanent: true },
      // `/goals` is NOT here any more: T13 gave it a page again. The line had to go before
      // the page could exist at all — a redirect resolves ahead of the App Router, so a
      // `goals/page.tsx` under one is dead code that never renders.
      //
      // Expect the 308 to outlive its removal on devices that already followed it. It was
      // `permanent`, which browsers and an installed PWA shell cache hard and do not
      // revalidate; clearing the site's data is the only reliable fix on a phone.
      {
        source: "/todos/routines",
        destination: "/activity/routines",
        permanent: true,
      },
      {
        source: "/todos/habits",
        destination: "/activity/habits",
        permanent: true,
      },
    ]
  },
  experimental: {
    serverActions: {
      // Restoring a backup posts the whole export as a Server Action argument, and the
      // default ceiling is 1 MB. A measured export runs about 350 bytes per row, so that
      // default is roughly 3,000 rows — reachable after a few years of daily meals and
      // transactions, and a limit nobody would think to check until a restore failed.
      // 8 MB is ~24,000 rows, which is well past any single-user dataset.
      bodySizeLimit: "8mb",
    },
  },
}

export default nextConfig
