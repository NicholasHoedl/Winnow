/*
 * Winnow's service worker. Hand-written and deliberately small — see
 * docs/adr/0007-hand-written-service-worker.md for why this is not @serwist/next.
 *
 * What it does: makes the app's static assets load from disk, and answers a failed
 * NAVIGATION with public/offline.html instead of the browser's error page. On an
 * installed iOS PWA that is the difference between a blank screen and something that
 * explains itself, and over a tailnet "no network" is the normal state of a phone on
 * someone else's wifi, not an edge case.
 *
 * What it deliberately does NOT do: cache a single page, RSC payload, or API response.
 * Nothing user-owned is ever written to disk. That is not timidity — ARCHITECTURE.md
 * §6.2 requires dynamic pages stay network-only, and the app leans on it harder than it
 * looks: `ensureRecurringTasks()` materialises rows during a page read (page rendering IS
 * the scheduler — there is no cron), every hub freezes "today" into its HTML at render
 * time, `revalidatePath()` cannot reach Cache Storage, and sign-out cannot clear it. A
 * navigation cache would quietly break all four.
 *
 * Keep this file short enough to read in one sitting. A service worker outlives a bad
 * deploy — if the fetch handler ships broken, users keep it until it is replaced.
 */

// Bump to invalidate everything. `activate` deletes any winnow-* cache that isn't
// one of the two below, so a bump is the whole eviction story.
const VERSION = "v1"
const PRECACHE = `winnow-precache-${VERSION}`
const RUNTIME = `winnow-runtime-${VERSION}`

const OFFLINE_URL = "/offline.html"

// Only files with STABLE names can be precached — everything the build emits is
// content-hashed, so it can't be named here. That's fine: hashed URLs are immutable,
// which is exactly what makes the runtime cache below safe with no manifest at all.
//
// Every one of these must be exempt from the proxy matcher in src/proxy.ts. `addAll`
// is all-or-nothing, so if one path answers with a redirect to /login the whole install
// fails — which is how the font's missing exemption got caught. Strictness is the point.
const PRECACHE_PATHS = [
  OFFLINE_URL,
  "/fonts/bricolage-grotesque-latin.woff2",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
]

self.addEventListener("install", (event) => {
  // No skipWaiting(). On a FIRST install there is no worker to wait for, so this
  // activates straight away; on an UPDATE it waits for open tabs to close, which
  // keeps the old worker serving a tab whose chunk hashes the new build no longer
  // has. That skew is inherent to any deploy — the point is not to force it.
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_PATHS)),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter(
            (n) => n.startsWith("winnow-") && n !== PRECACHE && n !== RUNTIME,
          )
          .map((n) => caches.delete(n)),
      )
      // Take over pages that loaded before this worker existed, so the very first
      // visit is protected rather than the second.
      await self.clients.claim()
    })(),
  )
})

// Immutable by construction: /_next/static/* filenames contain a content hash, so a
// URL that is in the cache can never be out of date. This is the one and only reason
// cache-first is safe here without a precache manifest.
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/")
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(cacheName)
    // Not awaited: the response should not wait on disk. Swallowed because a full
    // quota is a reason to serve the page anyway, not to fail the request.
    cache.put(request, response.clone()).catch(() => {})
  }
  return response
}

self.addEventListener("fetch", (event) => {
  const request = event.request

  // 1. Server Actions and every mutation are POSTs, and the Cache API only stores GET.
  //    §6.2's "never cache Server Actions" therefore costs nothing to honour.
  if (request.method !== "GET") return

  const url = new URL(request.url)

  // 2. Cross-origin. Open Food Facts already models its own offline state
  //    (docs/adr/0005-open-food-facts-from-a-server-action.md) — don't second-guess it.
  if (url.origin !== self.location.origin) return

  // 3. Hashed build output, and 4. the precached static files. Same strategy, two
  //    reasons: the first is immutable, the second is what has to exist offline.
  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request, RUNTIME))
    return
  }
  if (PRECACHE_PATHS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, PRECACHE))
    return
  }

  // 5. Navigations: network-only, with the offline page as a last resort.
  //
  //    Keyed on request.mode, NOT on the URL. App Router client navigation fetches the
  //    SAME path with ?_rsc=<hash> and an RSC header, expecting a Flight payload — hand
  //    that request an HTML page and the router breaks in a way that is very hard to
  //    read. Those requests are not mode "navigate", so they fall through to 6.
  //
  //    Only a network REJECTION falls back. A resolved response is returned untouched
  //    however unhappy it is: a 307 to /login has to reach the browser for auth to work
  //    at all, and a 500 has to reach the error boundary.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL)
        return (
          cached ??
          new Response("You're offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        )
      }),
    )
    return
  }

  // 6. Everything else — RSC payloads, route handlers, /settings/export — straight to
  //    the network, uncached and unwrapped. Offline they fail, which is correct: the
  //    alternative is showing someone stale money or a stale task list.
})
