import { test, expect } from "./_test"

import {
  ROUTES,
  clearWideContent,
  describeFaults,
  layoutFaults,
  seedWideContent,
} from "./_layout"

/**
 * The same sweep, at the widths a laptop actually is.
 *
 * **The detector was correct and pointed at one width.** `mobile-layout.spec.ts` has run at
 * 393px since it was written, and every fault it found was a phone fault — which quietly
 * created the impression that the app was clean everywhere else. It is not: a screenshot
 * pass at 1280px found the budget stat tile rendering `$1,450.(`, the macros tile rendering
 * `Cal1215` and clipping `Protein10⌐`, and the goals card truncating its own header to
 * `Goals & pr...`. Every one of those is a SPILL under this file's own definition, and
 * nothing in the suite was looking.
 *
 * Two widths, and both are measured rather than round:
 *
 *   1280×800 — a 13" laptop, and the width where the faults above appear.
 *   1366×768 — the other common panel, and the one `docs/HANDOFF.md` measured at 12px of
 *   page overflow when 1280 was at 231px. Different failure, so it is worth its own pass.
 *
 * Chromium here rather than WebKit, deliberately: the phone sweep exists because Safari is
 * the engine that ships on the target device, and at laptop width the browser is whatever
 * the user opens. One engine is enough, and this project is already paying for two.
 *
 * Its own project rather than joining `chromium`, for the same reason `mobile` has one: the
 * suite is serial and shares an account, so a sweep interleaved with specs that create and
 * delete rows would measure their debris. That is not hypothetical — a task left behind by a
 * failing spec once made the phone sweep report a spill on `/activity`, and root-causing it
 * cost half an hour and ended somewhere unrelated.
 */

const PREFIX = "E2E desktop"

/** Width and the height that ships with it, so each pass is a real panel rather than a number. */
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
] as const

test.beforeAll(async ({ browser }) => {
  await seedWideContent(browser, PREFIX)
})

test.afterAll(async () => {
  await clearWideContent(PREFIX)
})

for (const { width, height } of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`${route} fits ${width}px`, async ({ page }) => {
      // Set before navigating: a resize after load leaves anything that measured itself on
      // mount holding the old figure, which is a fault this sweep would then invent.
      await page.setViewportSize({ width, height })
      await page.goto(route)

      // The heading is the signal that the route rendered rather than 404ing or hanging on
      // a Suspense boundary — measuring an empty page would pass and mean nothing.
      await expect(page.locator("h1").first()).toBeVisible()

      const faults = await layoutFaults(page)
      expect(
        faults,
        `${route} at ${width}px:${describeFaults(faults)}\n`,
      ).toEqual([])
    })
  }
}
