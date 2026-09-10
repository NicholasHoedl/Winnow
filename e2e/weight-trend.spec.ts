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

test.afterEach(async ({ page }) => {
  await deleteWeightsOn([TWO_WEEKS_AGO, TODAY])
  // Back to the defaults whatever happened above: tracking on, no goal.
  await page.goto("/settings/defaults")
  await tracking(page).getByRole("button", { name: "On", exact: true }).click()
  await page.getByLabel("Goal weight").fill("")
  await savePreferences(page)
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
  ).toHaveCount(2) // the card and the chart heading agree
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
