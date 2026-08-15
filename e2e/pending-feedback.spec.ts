import { test, expect, type Page } from "./_test"

/**
 * Navigation acknowledges the tap.
 *
 * Two cases, and the second is the one nothing else in the app could ever cover:
 *
 *   CROSS-ROUTE — tapping a nav tab. A warm prefetch renders the destination's
 *   `loading.tsx` instantly and this is invisible; a cold one (stale router cache, PWA
 *   resumed from the background, cellular) shows nothing at all until the RSC payload
 *   lands, which on a phone is indistinguishable from a dead button.
 *
 *   SAME-ROUTE PARAM — stepping `/meals?date=…` back a day. The segment is NOT remounted,
 *   so `loading.tsx` never fires. Without a per-link spinner the entire old page simply
 *   sits there for the whole round trip.
 *
 * Both are made deterministic by delaying the RSC request ourselves rather than hoping the
 * server is slow — a real pending window here would be milliseconds and would flake.
 *
 * Located by `[data-pending]`, never by text: the swap is icon-only precisely so that
 * `navigation.spec.ts`'s exact-innerText assertion keeps passing, and asserting on text
 * here would contradict that design.
 */

/** Hold the next RSC navigation for `ms`, so "in flight" is long enough to observe. */
async function delayNavigation(page: Page, ms: number) {
  await page.route(
    (url) => url.searchParams.has("_rsc"),
    async (route) => {
      await new Promise((r) => setTimeout(r, ms))
      await route.continue()
    },
  )
}

test("a nav tab shows a spinner while its route loads", async ({ page }) => {
  // The delay goes on BEFORE the page loads, and that ordering is the whole test. Next
  // prefetches every nav link that enters the viewport, so a delay installed after `goto`
  // arrives too late: the payload is already cached, the click issues no request at all,
  // and there is nothing to be pending about. Holding `_rsc` from the start keeps the
  // prefetch itself in flight, which is exactly the cold-cache case this guards.
  await delayNavigation(page, 1500)
  await page.goto("/")

  // `.first()` is the sidebar. The bottom bar is `md:hidden` and therefore not clickable
  // in the desktop project; both render the same component, so either proves the wiring.
  const nav = page.getByRole("navigation").first()
  const budget = nav.getByRole("link", { name: "Budget", exact: true })

  await budget.click()

  // The tapped link acknowledges — and only that link.
  await expect(budget.locator("[data-pending]")).toBeVisible()

  // The constraint that shaped the whole design, asserted at the one moment it could
  // plausibly break: a spinner must add no text to the nav. `navigation.spec.ts` pins
  // these seven labels, and `sr-only` would leak into innerText.
  expect(await nav.getByRole("link").allInnerTexts()).toEqual([
    "Dashboard",
    "Activity",
    "Goals",
    "Calendar",
    "Budget",
    "Meals",
    "Review",
  ])

  await page.unrouteAll({ behavior: "ignoreErrors" })
  await expect(page.getByRole("heading", { name: "Budget" })).toBeVisible()
  await expect(budget.locator("[data-pending]")).toHaveCount(0)
})

test("a same-route date stepper shows a spinner, where no skeleton ever fires", async ({
  page,
}) => {
  await page.goto("/meals")
  const previous = page.getByRole("link", { name: "Previous day" })
  await expect(previous).toBeVisible()

  await delayNavigation(page, 1500)
  await previous.click()

  await expect(previous.locator("[data-pending]")).toBeVisible()

  await page.unrouteAll({ behavior: "ignoreErrors" })
  await expect(previous.locator("[data-pending]")).toHaveCount(0)
})
