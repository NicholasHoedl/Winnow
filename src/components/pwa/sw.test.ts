import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// public/sw.js can't be imported — it is a service worker, not a module, and it lives
// outside src/. So it gets EVALUATED instead, against a fake worker global. That is
// enough to exercise the whole fetch handler without a browser, which matters because
// the worker only registers in production builds (see register-service-worker.tsx) and
// so the ordinary `pnpm test:e2e` run structurally cannot reach it.
//
// The browser-level proof that it is actually installed and serving lives in
// e2e-prod/offline.spec.ts. These two are not substitutes for each other.

const ORIGIN = "https://winnow.test"
const SW_SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8")

type FakeRequest = { url: string; method: string; mode: string }

function request(
  url: string,
  init: { method?: string; mode?: string } = {},
): FakeRequest {
  return {
    url: url.startsWith("http") ? url : `${ORIGIN}${url}`,
    method: init.method ?? "GET",
    // Real navigations are mode "navigate"; RSC/data fetches are not. Defaulting to
    // "cors" keeps every test that doesn't say otherwise on the non-navigation path.
    mode: init.mode ?? "cors",
  }
}

class FakeCache {
  store = new Map<string, Response>()

  async match(req: FakeRequest | string) {
    const key = typeof req === "string" ? `${ORIGIN}${req}` : req.url
    return this.store.get(key)
  }
  async put(req: FakeRequest | string, res: Response) {
    const key = typeof req === "string" ? `${ORIGIN}${req}` : req.url
    this.store.set(key, res)
  }
  async addAll(paths: string[]) {
    // Body names the path, so an assertion can tell WHICH cached file came back
    // rather than just that something did.
    for (const p of paths)
      this.store.set(`${ORIGIN}${p}`, new Response(`cached:${p}`))
  }
}

class FakeEvent {
  responded: Promise<Response> | null = null
  waited: Promise<unknown>[] = []
  constructor(public request?: FakeRequest) {}

  respondWith(value: Response | Promise<Response>) {
    this.responded = Promise.resolve(value)
  }
  waitUntil(value: Promise<unknown>) {
    this.waited.push(value)
  }
  /** Resolve everything the handler kicked off. */
  async settle() {
    await Promise.all(this.waited)
    return this.responded ? await this.responded : null
  }
}

/** Load public/sw.js into a throwaway worker global and hand back the controls. */
function loadWorker(
  respond: (req: FakeRequest) => Promise<Response> = async () =>
    new Response("net"),
) {
  const listeners: Record<string, (event: FakeEvent) => void> = {}
  const caches = new Map<string, FakeCache>()
  const networkCalls: string[] = []
  let claimed = false

  const cacheStorage = {
    async open(name: string) {
      if (!caches.has(name)) caches.set(name, new FakeCache())
      return caches.get(name)!
    },
    async keys() {
      return [...caches.keys()]
    },
    async delete(name: string) {
      return caches.delete(name)
    },
    // The real caches.match() searches every cache, which the worker relies on.
    async match(req: FakeRequest | string) {
      for (const cache of caches.values()) {
        const hit = await cache.match(req)
        if (hit) return hit
      }
      return undefined
    },
  }

  const workerSelf = {
    addEventListener(type: string, fn: (event: FakeEvent) => void) {
      listeners[type] = fn
    },
    location: { origin: ORIGIN },
    clients: {
      async claim() {
        claimed = true
      },
    },
  }

  const fetchStub = async (req: FakeRequest) => {
    networkCalls.push(req.url)
    return respond(req)
  }

  new Function("self", "caches", "fetch", "Response", "URL", SW_SOURCE)(
    workerSelf,
    cacheStorage,
    fetchStub,
    Response,
    URL,
  )

  return {
    caches,
    networkCalls,
    isClaimed: () => claimed,
    async fire(req: FakeRequest) {
      const event = new FakeEvent(req)
      listeners.fetch(event)
      return event
    },
    async lifecycle(type: "install" | "activate") {
      const event = new FakeEvent()
      listeners[type](event)
      await event.settle()
      return event
    },
  }
}

/** Drive the real install handler and report what it actually asked to precache. */
async function precachedPaths(): Promise<string[]> {
  const worker = loadWorker()
  await worker.lifecycle("install")
  const entries = [...worker.caches.values()].flatMap((c) => [
    ...c.store.keys(),
  ])
  return entries.map((url) => url.replace(ORIGIN, "")).sort()
}

describe("service worker — what it refuses to touch", () => {
  it("ignores non-GET requests, so Server Actions are never intercepted", async () => {
    const worker = loadWorker()
    const event = await worker.fire(request("/activity", { method: "POST" }))
    expect(event.responded).toBeNull()
  })

  it("ignores cross-origin requests", async () => {
    const worker = loadWorker()
    const event = await worker.fire(
      request("https://world.openfoodfacts.org/api/v2/x"),
    )
    expect(event.responded).toBeNull()
  })

  it("passes RSC and other same-origin GETs straight through, uncached", async () => {
    const worker = loadWorker()
    const event = await worker.fire(request("/activity?_rsc=abc123"))
    expect(event.responded).toBeNull()
  })
})

describe("service worker — static assets", () => {
  it("serves hashed build output from cache on the second request", async () => {
    const worker = loadWorker()
    const url = "/_next/static/chunks/04s2dbpgvsd6-.js"

    const first = await worker.fire(request(url))
    await first.settle()
    const second = await worker.fire(request(url))
    await second.settle()

    expect(worker.networkCalls).toEqual([`${ORIGIN}${url}`])
  })

  it("does not cache a failed asset response", async () => {
    const worker = loadWorker(async () => new Response("nope", { status: 500 }))
    const url = "/_next/static/chunks/broken.js"

    await (await worker.fire(request(url))).settle()
    await (await worker.fire(request(url))).settle()

    // Both went to the network — nothing was written on the 500.
    expect(worker.networkCalls).toHaveLength(2)
  })

  it("serves precached files from cache", async () => {
    const worker = loadWorker()
    await worker.lifecycle("install")
    const event = await worker.fire(request("/icons/icon-192.png"))
    await event.settle()

    expect(worker.networkCalls).toEqual([])
  })
})

describe("service worker — navigation fallback", () => {
  it("serves the offline page when the network rejects", async () => {
    const worker = loadWorker(async () => {
      throw new TypeError("Failed to fetch")
    })
    await worker.lifecycle("install")

    const event = await worker.fire(request("/activity", { mode: "navigate" }))
    const response = await event.settle()

    expect(await response!.text()).toBe("cached:/offline.html")
  })

  it("does NOT serve the offline page to a failed RSC fetch", async () => {
    // The sharp one. App Router client navigation fetches the SAME path with ?_rsc=,
    // expecting a Flight payload; handing it HTML breaks the router in a way that is
    // very hard to read back to a cause. It is distinguished by mode, not by URL.
    const worker = loadWorker(async () => {
      throw new TypeError("Failed to fetch")
    })
    await worker.lifecycle("install")

    const event = await worker.fire(request("/activity?_rsc=abc123"))

    expect(event.responded).toBeNull()
  })

  it("passes a 307 to /login through untouched", async () => {
    // Auth depends on this reaching the browser. If the worker answered the offline
    // page whenever the response was merely un-OK, an expired session would look like
    // a network outage and there would be no way to sign back in.
    const worker = loadWorker(
      async () =>
        new Response(null, { status: 307, headers: { location: "/login" } }),
    )
    await worker.lifecycle("install")

    const event = await worker.fire(request("/activity", { mode: "navigate" }))
    const response = await event.settle()

    expect(response!.status).toBe(307)
    expect(response!.headers.get("location")).toBe("/login")
  })

  it("passes a 500 through so the error boundary still renders", async () => {
    const worker = loadWorker(async () => new Response("boom", { status: 500 }))
    await worker.lifecycle("install")

    const event = await worker.fire(request("/activity", { mode: "navigate" }))
    const response = await event.settle()

    expect(response!.status).toBe(500)
  })

  it("still answers when the offline page itself is missing from the cache", async () => {
    const worker = loadWorker(async () => {
      throw new TypeError("Failed to fetch")
    })
    // Note: no install, so nothing is precached.
    const event = await worker.fire(request("/activity", { mode: "navigate" }))
    const response = await event.settle()

    expect(response!.status).toBe(503)
  })
})

describe("service worker — lifecycle", () => {
  it("claims open clients on activate", async () => {
    const worker = loadWorker()
    await worker.lifecycle("activate")
    expect(worker.isClaimed()).toBe(true)
  })

  it("deletes stale winnow caches and keeps the current ones", async () => {
    const worker = loadWorker()
    await worker.lifecycle("install")
    const current = [...worker.caches.keys()]
    worker.caches.set("winnow-precache-v0", new FakeCache())
    worker.caches.set("some-other-app", new FakeCache())

    await worker.lifecycle("activate")

    expect([...worker.caches.keys()].sort()).toEqual(
      [...current, "some-other-app"].sort(),
    )
  })
})

describe("service worker — precache list vs the proxy", () => {
  it("precaches only files the proxy will serve unauthenticated", async () => {
    // This is the bug that actually happened: /fonts/*.woff2 was not exempt in
    // src/proxy.ts, so an unauthenticated request 307'd to /login. `cache.addAll` is
    // all-or-nothing and `cache.put` rejects a redirected Response, so ONE missing
    // exemption silently means no offline support at all.
    //
    // Driven off the real install handler rather than a parsed literal, so adding a
    // path to PRECACHE_PATHS without exempting it fails here.
    const proxySource = readFileSync(
      join(process.cwd(), "src", "proxy.ts"),
      "utf8",
    )
    // The matcher is a single-line string literal containing no quotes, so match to the
    // closing quote. (Not a dot-all `.*?` — the `s` flag needs an ES2018 target and
    // tsconfig sets ES2017.)
    const matcher = proxySource.match(/"(\/\(\(\?![^"]*)"/)?.[1]
    expect(matcher, "could not find the matcher in src/proxy.ts").toBeDefined()

    const gated = new RegExp(`^${matcher!.replace(/\\\\/g, "\\")}$`)
    const paths = await precachedPaths()
    expect(paths.length).toBeGreaterThan(0)

    expect(paths.filter((p) => gated.test(p))).toEqual([])
  })
})
