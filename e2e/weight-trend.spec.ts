import { test, expect, type Page } from "./_test"

import { deleteWeightsOn, seedWeights } from "./_weights"

// T29: weight is a trend to watch. The maths has its unit tests and the meals page's card
// and chart have `meals-water-weight.spec.ts`; what only a browser can prove is the wiring
// that reaches OUT of that page — the dashboard's Macros tile quoting the same trend, the
// goal weight set on /settings turning up beside it, and the switch taking every trace of
// weight off both pages without deleting a row.
//
// The setting is RESTORED at the end, and in `afterEach` too: the suite runs serially
// against one database, and tracking left off would blank the meals spec's weigh-in card.
//
// T32 put the chart in the dashboard's fold shell. The second test is the fold's
// reload assertion for the one foldable card that is not on the dashboard, and the card is
// left EXPANDED for the same reason `dashboard-collapse.spec.ts` leaves Slate expanded.

/** ISO date `n` days from today, in the browser's zone — the one the app renders in. */
function inDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const pad = (v: number) => String(v).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const TODAY = inDays(0)
const TWO_WEEKS_AGO = inDays(-14)

function preferencesForm(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save defaults" }) })
}

async function savePreferences(page: Page) {
  await preferencesForm(page)
    .getByRole("button", { name: "Save defaults" })
    .click()
  await expect(page.getByText("Defaults saved")).toBeVisible()
}

/** The switch, by its own accessible name — see `settings-defaults.spec.ts` on `exact`. */
function tracking(page: Page) {
  return preferencesForm(page).getByRole("group", {
    name: "Track body weight",
    exact: true,
  })
}

async function setTracking(page: Page, on: boolean) {
  await page.goto("/settings/defaults")
  await tracking(page)
    .getByRole("button", { name: on ? "On" : "Off", exact: true })
    .click()
  await savePreferences(page)
}

async function setGoalWeight(page: Page, value: string) {
  await page.goto("/settings/defaults")
  await page.getByLabel("Goal weight").fill(value)
  await savePreferences(page)
}

/** The chart card's chevron, whichever way it points — `dashboard-collapse.spec.ts`'s helper. */
function toggle(page: Page, name: string) {
  return page.getByRole("button", {
    name: new RegExp(`^(Collapse|Expand) ${name}$`),
  })
}

/**
 * Click the chevron and wait for the WRITE. The fold is optimistic, so the card moves
 * long before the preference is stored, and navigating on the back of that loses it —
 * see the same helper in `dashboard-collapse.spec.ts` for how that was found.
 */
async function fold(page: Page, name: string) {
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.status() === 200,
    ),
    toggle(page, name).click(),
  ])
}

test.afterEach(async ({ page }) => {
  // Back to the defaults whatever happened above: tracking on, no goal.
  await page.goto("/settings/defaults")
  await tracking(page).getByRole("button", { name: "On", exact: true }).click()
  await page.getByLabel("Goal weight").fill("")
  await savePreferences(page)
  // The chart's fold is a preference too, and a chart left folded would take the trend
  // off /meals for every spec after this one. Unfolded BEFORE the weigh-ins go: with no
  // weigh-ins there is no card, and nothing to unfold.
  await page.goto("/meals")
  const chevron = toggle(page, "Weight trend")
  if (
    (await chevron.count()) > 0 &&
    (await chevron.getAttribute("aria-expanded")) === "false"
  ) {
    await fold(page, "Weight trend")
  }
  await deleteWeightsOn([TWO_WEEKS_AGO, TODAY])
})

test("the dashboard quotes the trend, the goal reaches it from settings, and the switch hides it all", async ({
  page,
}) => {
  // Two weeks apart, 185 down to 181: the trend closes about three quarters of the gap
  // (≈182.0) and moves at about 1.5 lb a week. `weightTrend`'s tests own those figures.
  await seedWeights([
    { date: TWO_WEEKS_AGO, weightLb: 185 },
    { date: TODAY, weightLb: 181 },
  ])

  const macros = page.locator('[data-card="macros"]')
  await page.goto("/")
  await expect(macros).toContainText("Weight")
  await expect(macros).toContainText("181 lb")
  await expect(macros).toContainText("trend 182 lb · −1.5 lb/wk")

  // --- A goal set on /settings is measured against the TREND, and turns up on both pages
  // in words — the short form on the tile, the estimate on the meals page.
  await setGoalWeight(page, "175")
  await page.goto("/")
  await expect(macros).toContainText("7 lb to go")

  await page.goto("/meals")
  await expect(
    page.getByText("7 lb to go, about 5 weeks at this rate"),
  ).toHaveCount(2) // the card and the chart's caption agree
  // The Goal weight field remembers what it was given, in the display unit.
  await page.goto("/settings/defaults")
  await expect(page.getByLabel("Goal weight")).toHaveValue("175")

  // --- Off: no card, no chart, no line — and nothing deleted, which the last step proves.
  await setTracking(page, false)
  await expect(page.getByLabel("Goal weight")).toHaveCount(0)

  await page.goto("/meals")
  await expect(page.getByLabel("Weight", { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole("img", { name: /body weight over the last/i }),
  ).toHaveCount(0)

  await page.goto("/")
  await expect(macros).toBeVisible()
  await expect(macros).not.toContainText("Weight")

  // --- On again: the rows were kept, so the trend is exactly where it was.
  await setTracking(page, true)
  await page.goto("/")
  await expect(macros).toContainText("trend 182 lb · −1.5 lb/wk")
})

test("the trend chart folds to its heading and stays folded across a reload", async ({
  page,
}) => {
  await seedWeights([
    { date: TWO_WEEKS_AGO, weightLb: 185 },
    { date: TODAY, weightLb: 181 },
  ])
  await page.goto("/meals")
  const chart = page.getByRole("img", { name: /body weight over the last/i })
  const region = page.getByRole("region", { name: "Weight trend" })
  await expect(chart).toBeVisible()
  await expect(toggle(page, "Weight trend")).toHaveAttribute(
    "aria-expanded",
    "true",
  )

  await fold(page, "Weight trend")
  // The body is the region named by the heading, so folding removes it — chart and all.
  // The heading stays, and the weigh-in card above still has its input and its readout.
  await expect(region).toHaveCount(0)
  await expect(chart).toHaveCount(0)
  await expect(
    page.getByRole("heading", { name: "Weight trend" }),
  ).toBeVisible()
  await expect(page.getByLabel("Weight", { exact: true })).toBeVisible()

  // The assertion this test exists for: only a reload proves the preference was written.
  await page.goto("/meals")
  await expect(region).toHaveCount(0)
  await expect(toggle(page, "Weight trend")).toHaveAttribute(
    "aria-expanded",
    "false",
  )

  // And back, which also leaves the card as every later spec expects it.
  await fold(page, "Weight trend")
  await expect(chart).toBeVisible()
  await page.goto("/meals")
  await expect(chart).toBeVisible()
  await expect(toggle(page, "Weight trend")).toHaveAttribute(
    "aria-expanded",
    "true",
  )
})
