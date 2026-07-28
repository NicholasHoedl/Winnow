import { expect, test } from "@playwright/test"

// The browser-level half of the service-worker proof. src/components/pwa/sw.test.ts
// covers the routing decisions in a fake worker global; this covers the part that file
// cannot — that the worker is genuinely registered, activated, and in the request path
// of a real production build.

/** Resolves once the worker has called clients.claim() and taken over this page. */
async function waitForWorker(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    null,
    { timeout: 30_000 },
  )
}

test("registers the worker without hijacking normal navigation", async ({
  page,
}) => {
  // The discriminating half of the pair below: a worker that answered the offline page
  // to everything would pass the offline test and fail this one.
  await page.goto("/")
  await waitForWorker(page)

  await page.reload()
  await expect(
    page.getByRole("heading", { name: /good to see you/i }),
  ).toBeVisible()
})

test("serves the offline page once the network is gone", async ({
  page,
  context,
}) => {
  await page.goto("/")
  await waitForWorker(page)

  await context.setOffline(true)
  try {
    await page.goto("/todos")

    await expect(
      page.getByRole("heading", { name: "No connection" }),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()

    // Proves the precache actually holds the committed woff2 rather than the page
    // quietly falling back to Arial — the whole reason that file is committed.
    await page.evaluate(() => document.fonts.ready)
    const brandFont = await page.evaluate(() =>
      document.fonts.check('800 3rem "Bricolage Grotesque"'),
    )
    expect(brandFont).toBe(true)
  } finally {
    await context.setOffline(false)
  }
})
