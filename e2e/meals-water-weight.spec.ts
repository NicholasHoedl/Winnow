import { test, expect } from "./_test"

import { seedWeights } from "./_weights"

// Browser coverage for T4-S12: logging water, recording a weigh-in, and the trend chart.
//
// Per-run days, and every row this spec creates is deleted at the end. `body_weights` is
// the sharp case the T4 plan flagged: unique(user_id, date) means a leftover row
// PRE-FILLS the weight input on the next run, so a failure to clean up shows up as a
// silently wrong value rather than a visible error.
const DAY_MS = 86_400_000
const DAY = new Date(Date.UTC(2013, 0, 1) + (Date.now() % 1200) * DAY_MS)
  .toISOString()
  .slice(0, 10)
const EARLIER = new Date(Date.parse(DAY) - 21 * DAY_MS)
  .toISOString()
  .slice(0, 10)

type Page = import("@playwright/test").Page

// `exact` on both of these is load-bearing. Playwright matches accessible names by
// substring, and this page has a chart labelled "Body weight over the last N weeks" and
// water chips labelled "Remove 8 fl oz" — so the loose forms match two elements each.
const weightInput = (page: Page) => page.getByLabel("Weight", { exact: true })
const removeWeight = (page: Page) =>
  page.getByRole("button", { name: "Remove", exact: true })

/**
 * The day's running total — the `<span>` reading e.g. "24 fl oz".
 *
 * `visible` is load-bearing for the same reason it is in `_card.ts`: React's streaming
 * SSR parks completed Suspense content in a `<div hidden id="S:n">` and leaves it in the
 * DOM, so this span exists twice — once rendered, once staged. Strict mode counts both
 * before `toBeVisible()` filters them, and the failure ("resolved to 2 elements … one
 * hidden") looks nothing like its cause. Reproduces against a production build too, so
 * it is not a dev-server artifact.
 */
const waterTotal = (page: Page) =>
  page.getByText(/^\d+(\.\d+)? fl oz$/).filter({ visible: true })

/**
 * Remove the weigh-in on `date` if one is there, so the next run starts empty.
 *
 * The `expect(...).toBeVisible()` before reading the value is not decoration. The first
 * version of this branched on `removeWeight(page).isVisible()`, which does NOT auto-wait
 * — straight after `goto` it returned false before the card had rendered, so cleanup
 * silently skipped and the spec passed while leaving rows behind. Waiting for the input
 * first makes the read meaningful, and the `toHaveValue("")` at the end turns any
 * remaining race into a visible failure rather than a silent leak.
 */
async function clearWeight(page: Page, date: string) {
  await page.goto(`/meals?date=${date}`)
  const input = weightInput(page)
  await expect(input).toBeVisible()
  if ((await input.inputValue()) === "") return
  await removeWeight(page).click()
  await expect(input).toHaveValue("")
}

/** Drop every water log on `date`. Reloads between chips so no toast covers the next. */
async function clearWater(page: Page, date: string) {
  await page.goto(`/meals?date=${date}`)
  const chips = page.getByRole("button", { name: /^Remove [\d.]+ fl oz$/ })

  // Bounded rather than `while`: a chip that fails to delete must end the loop and let
  // the assertion below report it, not spin.
  for (let i = 0; i < 12; i++) {
    // Wait for the card to be painted before counting. `count()` does NOT auto-wait, and
    // `toHaveCount(0)` is trivially satisfied by a page that hasn't rendered yet — so
    // without this gate after each reload, the loop exits on the first frame and the
    // assertion below passes against an empty DOM while the rows are still in Postgres.
    // That is not hypothetical: it is how a throwaway version of this left rows behind.
    await expect(waterTotal(page)).toBeVisible()
    if ((await chips.count()) === 0) break
    await chips.first().click()
    await page.reload()
  }

  await expect(waterTotal(page)).toBeVisible()
  await expect(chips).toHaveCount(0)
}

// Cleanup lives here, not only at the end of each test body: a failing assertion aborts
// the test, and these rows sit on a per-run date that no later run will ever revisit.
// afterEach runs on failure too, so a red test can't quietly poison the next one.
test.afterEach(async ({ page }) => {
  await clearWater(page, DAY)
  await clearWeight(page, DAY)
  await clearWeight(page, EARLIER)
})

test("water accumulates in taps and each tap can be undone", async ({
  page,
}) => {
  await page.goto(`/meals?date=${DAY}`)

  const total = waterTotal(page)
  await expect(page.getByRole("button", { name: "+8 fl oz" })).toBeVisible()
  await expect(total).toHaveText("0 fl oz")

  // Two taps accumulate rather than replacing each other — that is the whole reason
  // water_logs is a row per log instead of one row per day.
  await page.getByRole("button", { name: "+8 fl oz" }).click()
  await expect(total).toHaveText("8 fl oz")
  await page.getByRole("button", { name: "+16 fl oz" }).click()
  await expect(total).toHaveText("24 fl oz")

  // Each log is individually removable, and removing one is undoable.
  await page.getByRole("button", { name: "Remove 16 fl oz" }).click()
  await expect(total).toHaveText("8 fl oz")
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(total).toHaveText("24 fl oz")

  // Cleanup: drop both logs. Reload between them so the undo toast can't sit over the
  // next chip's hit area.
  for (const label of ["Remove 16 fl oz", "Remove 8 fl oz"]) {
    await page.getByRole("button", { name: label }).click()
    await page.reload()
  }
  await expect(
    page.getByRole("button", { name: /^Remove \d+ fl oz$/ }),
  ).toHaveCount(0)
})

test("a weigh-in saves, corrects in place, and drives the trend chart", async ({
  page,
}) => {
  await clearWeight(page, DAY)
  await clearWeight(page, EARLIER)

  // --- One weigh-in three weeks back, so the chart has two weeks to join.
  await page.goto(`/meals?date=${EARLIER}`)
  await weightInput(page).fill("184.2")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(removeWeight(page)).toBeVisible()

  // A single weigh-in is not a trend: it must say so rather than draw a one-point line.
  await expect(page.getByText(/log another weigh-in/i)).toBeVisible()

  // --- Today's weigh-in.
  await page.goto(`/meals?date=${DAY}`)
  // The input starts empty on a day with no row — if it were pre-filled from another
  // day, saving would overwrite that day's weight with a number the user never typed.
  await expect(weightInput(page)).toHaveValue("")
  await weightInput(page).fill("181.8")
  await page.getByRole("button", { name: "Save" }).click()

  // --- The trend appears, and the card quotes it (T29): the smoothed line three weeks
  // on from 184.2 towards 181.8, and how fast it is moving. The figures are
  // `weightTrend`'s, whose unit tests own the arithmetic; what this pins is that the page
  // shows them, in the account's unit, beside the input that fed them.
  const chart = page.getByRole("img", { name: /body weight over the last/i })
  await expect(chart).toBeVisible()
  const card = page.locator("form").filter({ has: weightInput(page) })
  await expect(card).toContainText("Trend 182.1 lb · −0.7 lb/wk")

  // --- A second save on the same day is a correction, not a second point: the trend
  // moves with it, and the chart still counts two weigh-ins.
  await weightInput(page).fill("182.0")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(card).toContainText("Trend 182.3 lb · −0.6 lb/wk")
  await expect(chart).toHaveAccessibleName(/over the last 2 weigh-ins/i)
  await page.reload()
  await expect(weightInput(page)).toHaveValue("182")

  // --- Out-of-range values are rejected with the schema's message, not stored.
  await weightInput(page).fill("1855")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText(/looks too high/i)).toBeVisible()
  await page.reload()
  await expect(weightInput(page)).toHaveValue("182")

  // Cleanup — both rows, or the next run's inputs come up pre-filled.
  await clearWeight(page, DAY)
  await clearWeight(page, EARLIER)
})

/**
 * T42 (Pass 8): the weigh-in's Remove toasted "Weight removed" and stopped there, while
 * the water card beside it — the same card, the same row of buttons — has offered Undo
 * since it was written.
 */
test("a removed weigh-in can be put back", async ({ page }) => {
  await clearWeight(page, DAY)

  await page.goto(`/meals?date=${DAY}`)
  await weightInput(page).fill("179.4")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(removeWeight(page)).toBeVisible()

  await removeWeight(page).click()
  await expect(weightInput(page)).toHaveValue("")

  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(weightInput(page)).toHaveValue("179.4")

  // Not just the box: the row is back, which is what the chart and the trend read.
  await page.reload()
  await expect(weightInput(page)).toHaveValue("179.4")
})

test("the day's log comes before the trend, and starts on the first screen", async ({
  page,
}) => {
  // 393 × 852, where the order is felt: a desktop shows the whole stack at once and a
  // phone shows one block at a time, so this is the width the page has to be ordered for.
  await page.setViewportSize({ width: 393, height: 852 })

  // Two weigh-ins, planted rather than typed: what this test is about is where the trend
  // card sits, and one weigh-in draws a note instead of a chart.
  await seedWeights([
    { date: EARLIER, weightLb: 184.2 },
    { date: DAY, weightLb: 181.8 },
  ])

  const name = `e2eorder${Date.now()}`
  await page.goto(`/meals?date=${DAY}`)
  const bar = page.getByLabel("Quick add meal")
  await bar.fill(`${name} 600cal 40p 30c 10f`)
  await bar.press("Enter")

  const row = page.locator(`div.bg-card:has-text("${name}")`)
  await expect(row.first()).toBeVisible()
  // Scoped to `main`: sonner's toast container is a `<section>` too, and the toast that
  // follows a quick add quotes the entry's name — so a bare `section` filter matches both.
  const log = page.locator("main section").filter({ hasText: name })
  const trend = page.getByRole("heading", { name: "Weight trend" })
  await expect(trend).toBeVisible()

  // Document order, which down a single column is reading order: the meal section the
  // entry is in, then the trend card. The chart is the tallest thing on the page and
  // (Pass 0) the least used, so it closes the page rather than pushing the log off it.
  const heading = (await trend.elementHandle())!
  const logIsFirst = await log.evaluate(
    (section, other) =>
      !!(
        section.compareDocumentPosition(other) &
        Node.DOCUMENT_POSITION_FOLLOWING
      ),
    heading,
  )
  expect(logIsFirst).toBe(true)

  // And with one entry on the day, the log begins inside the first screenful — the page
  // is not scrolled here, so this is the offset from the top of the document.
  const box = (await log.boundingBox())!
  expect(box.y).toBeLessThan(852)

  // Cleanup: the entry. The two weigh-ins go with the rest in afterEach.
  await row.first().getByRole("button", { name: "Entry actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row).toHaveCount(0)
})
