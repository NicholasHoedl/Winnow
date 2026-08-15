import type { NextConfig } from "next"

const nextConfig: NextConfig = {
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
