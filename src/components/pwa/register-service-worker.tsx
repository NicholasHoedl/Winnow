"use client"

import { useEffect } from "react"

// Registers public/sw.js. Mounted in the ROOT layout rather than (app), so it also runs
// on /login — a signed-out user should still end up with the offline page installed, and
// /sw.js is exempt from the proxy matcher precisely so that can happen.
//
// Renders nothing; same shape as AppearanceSync.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    // Production only, and not out of caution — it would be actively wrong in dev.
    // The worker is cache-first on /_next/static/*, whose filenames are content-hashed
    // in a build but NOT in dev (`src_app_page_tsx.js`, rewritten on every edit). A
    // worker in dev would serve yesterday's chunks and break HMR.
    if (process.env.NODE_ENV !== "production") {
      // Actively tear one down rather than just declining to register: `pnpm start` and
      // `pnpm dev` share localhost, so a worker installed by a local production build
      // would otherwise linger and poison dev on the same port.
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          registrations.forEach((r) => void r.unregister()),
        )
        .catch(() => {})
      return
    }

    // `updateViaCache: "none"` keeps the worker SCRIPT itself out of the HTTP cache, so a
    // new deploy is picked up rather than shadowed by a stale copy of the thing whose job
    // is to manage staleness. Per Next's own PWA guide; cheaper than a headers() block.
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      // Registration failing is not worth surfacing — the app works fine without it.
      .catch(() => {})
  }, [])

  return null
}
