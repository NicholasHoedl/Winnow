import { test, expect } from "./_test"

import { seedGoal, seedMilestone, deleteGoalsMatching } from "./_goals"
import { seedHabit, deleteHabitsMatching } from "./_habits"
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

/**
 * The goal detail dialog, which the route sweep above structurally cannot reach.
 *
 * Every test above measures a page as it lands. This one opens on a click, so it was never
 * in the sweep — and it is the widest thing the app draws inside a fixed-width box: a
 * milestone row carries a checkbox, a title, a date and two icon buttons, and the add row
 * below it carries a text field, a date field and a button.
 *
 * Reported from real use as a horizontal scrollbar on a phone. `DialogContent` is
 * `overflow-y-auto`, and the CSS overflow spec promotes the paired `visible` axis to
 * `auto` — so anything too wide gets a scrollbar rather than being clipped, which is the
 * mechanism `layoutFaults` documents at the top of `_layout.ts`.
 *
 * **Three widths, because the project's own 393 does not reproduce it.** The device here is
 * an iPhone 15; a 12 mini is 375 and an SE is 320, and the add row's two fixed-ish inputs
 * are exactly the kind of content that fits one width and not the next.
 */
for (const width of [320, 375, 393]) {
  test.describe(`goal detail at ${width}px`, () => {
    test.use({ viewport: { width, height: 812 } })

    test("the goal detail dialog fits a phone", async ({ page }) => {
      const title = `${PREFIX} goal ${width} ${Date.now()}`
      const goalId = await seedGoal({ title, targetDate: "2026-09-30" })
      // The worst case the dialog can draw: every milestone dated, and titles as long as
      // a real goal's — the report that prompted this had five of them.
      for (const [i, step] of [
        "Lose first 3 pounds before the end of the month",
        "Lose 6 pounds total",
        "Lose 9 pounds total",
        "Lose 12 pounds total",
        "Reach 15 pound goal",
      ].entries()) {
        await seedMilestone({
          goalId,
          title: step,
          dueDate: `2026-09-${String(5 + i * 5).padStart(2, "0")}`,
          sortOrder: i,
        })
      }
      // Both quota shapes. A measured habit renders a continuous bar and prints its
      // figures WITH the unit — "0/20 pages a day" — in a `shrink-0` span, which is a
      // different and wider row than the segmented one beside it.
      await seedHabit({ title: `${PREFIX} strength or cardio workout`, goalId })
      await seedHabit({
        title: `${PREFIX} log meals and calorie intake every day`,
        goalId,
        period: "day",
        unit: "pages",
        targetAmount: 20,
      })

      await page.goto("/goals")
      await page.getByRole("button", { name: `Open ${title}` }).click()
      await expect(page.getByRole("dialog")).toBeVisible()

      const faults = await layoutFaults(page)
      expect(
        faults,
        `goal detail dialog at ${width}px:${describeFaults(faults)}
`,
      ).toEqual([])

      await deleteHabitsMatching(PREFIX)
      await deleteGoalsMatching(PREFIX)
    })
  })
}
