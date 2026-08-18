import { test, expect } from "./_test"

import {
  ROUTES,
  clearWideContent,
  describeFaults,
  layoutFaults,
  seedWideContent,
} from "./_layout"

/**
 * Every screen at phone width, in real WebKit.
 *
 * The detector, the route list and the worst-case seed all live in `_layout.ts` now, shared
 * with `desktop-layout.spec.ts`. What is specific to this file is the width and the browser,
 * and the browser is the reason this project exists at all: `devices["iPhone 15"]` carries
 * `defaultBrowserType: "webkit"`, which the runner honours. A Chromium render at 393px is a
 * different engine wearing a phone's viewport and misses every Safari-specific difference.
 *
 * Three things it structurally cannot see, all of which need real hardware: Safari's toolbar
 * collapsing and resizing the viewport mid-scroll, a non-zero `env(safe-area-inset-bottom)`,
 * and anything gestural.
 */

const PREFIX = "E2E mobile"

test.beforeAll(async ({ browser }) => {
  await seedWideContent(browser, PREFIX)
})

// No `browser` and no page: the teardown is a `delete` against the test database now, so it
// no longer depends on `/budget` rendering a row menu — a page this file exists to distrust.
test.afterAll(async () => {
  await clearWideContent(PREFIX)
})

for (const route of ROUTES) {
  test(`${route} fits a phone`, async ({ page }) => {
    await page.goto(route)

    // The heading is the signal that the route rendered rather than 404ing or hanging on a
    // Suspense boundary — measuring an empty page would pass and mean nothing.
    await expect(page.locator("h1").first()).toBeVisible()

    const faults = await layoutFaults(page)
    expect(faults, `${route} at 393px:${describeFaults(faults)}\n`).toEqual([])
  })
}
