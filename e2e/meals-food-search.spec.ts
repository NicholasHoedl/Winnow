import { test, expect, type Page } from "./_test"

import { pageAction } from "./_menu"
import { serverWrite } from "./_server-write"

// Browser coverage for T31 (ADR-0025): one search bar over the library, the bundled
// reference foods and Open Food Facts.
//
// The reference foods live on the server and need no network, so for the first time the
// primary path is driven end to end offline. The Open Food Facts assertions stay
// offline-safe, as this file had them when it was `meals-food-db.spec.ts`: that request
// happens in a Server Action, which `page.route()` cannot intercept, and a self-hosted
// app's suite must not need the internet.

const rows = (name: string) => `div.bg-card:has-text("${name}")`
const BANANA = "Bananas, raw"

/**
 * Remove every entry and library row the reference banana left behind. In `afterEach` so a
 * failing assertion cannot leak a library food — one that the next run's "Your library"
 * assertion would then find, and pass on for the wrong reason.
 */
async function cleanUp(page: Page) {
  await page.goto("/meals")
  for (let i = 0; i < 5; i++) {
    const entries = page.locator(rows(BANANA))
    const count = await entries.count()
    if (count === 0) break
    await entries.first().getByRole("button", { name: "Entry actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(entries).toHaveCount(count - 1)
  }
  await pageAction(page, "Food library")
  for (let i = 0; i < 3; i++) {
    const remove = page.getByRole("button", { name: `Delete ${BANANA}` })
    const count = await remove.count()
    if (count === 0) break
    await remove.first().click()
    await expect(remove).toHaveCount(count - 1)
  }
  await page.keyboard.press("Escape")
}

test.afterEach(async ({ page }) => {
  await cleanUp(page)
})

test("the bar finds a reference food, scales its portion, and logging it fills the library", async ({
  page,
}) => {
  await page.goto("/meals")
  await page.getByRole("button", { name: "Log food" }).click()
  const search = page.getByPlaceholder(/search foods/i)
  await search.fill("banana")

  // The reference group answers offline; the library has no banana yet.
  const banana = page.getByRole("option", { name: /^Bananas, raw/ })
  await expect(banana).toBeVisible()
  // `exact`: the bar's footer line says "Reference foods are from USDA…", and a substring
  // match would resolve to the heading and the footer both.
  await expect(page.getByText("Reference foods", { exact: true })).toBeVisible()
  await expect(page.getByText("Your library", { exact: true })).toHaveCount(0)
  await banana.click()

  // Filled for its usual portion — a medium banana — from USDA's per-100 g figures.
  await expect(page.getByLabel("Food", { exact: true })).toHaveValue(BANANA)
  await expect(page.getByLabel("Serving", { exact: true })).toHaveValue(
    /1 medium .*\(118 g\)/,
  )
  await expect(page.getByLabel("Calories", { exact: true })).toHaveValue("105")

  // Another portion rewrites the label and every figure.
  await page.getByLabel("Portion").click()
  await page.getByRole("option", { name: /1 cup, sliced/ }).click()
  await expect(page.getByLabel("Serving", { exact: true })).toHaveValue(
    "1 cup, sliced (150 g)",
  )
  await expect(page.getByLabel("Calories", { exact: true })).toHaveValue(
    "133.5",
  )

  await page.getByRole("button", { name: "Log", exact: true }).click()
  const entry = page.locator(rows(BANANA)).first()
  await expect(entry).toBeVisible()
  await expect(entry).toContainText("1 cup, sliced (150 g)")

  // Saved to the library by default, so the next search lists it under Your library.
  await page.getByRole("button", { name: "Log food" }).click()
  await page.getByPlaceholder(/search foods/i).fill("banana")
  await expect(page.getByText("Your library", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("option", { name: /^Bananas, raw/ }).first(),
  ).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()
})

test("quick add falls through to the reference foods, and refuses what it cannot name", async ({
  page,
}) => {
  await page.goto("/meals")
  const bar = page.getByLabel("Quick add meal")
  await bar.fill("banana x2")
  await bar.press("Enter")
  await expect(page.getByText(/Logged Bananas, raw/)).toBeVisible()

  const entry = page.locator(rows(BANANA)).first()
  await expect(entry).toBeVisible()
  await expect(entry).toContainText(/2 × 1 medium/)

  // A name that is not clearly one food is refused in the bar's own words, text kept.
  await bar.fill("xyzzy not a food")
  await bar.press("Enter")
  await expect(page.getByText(/parse that/i)).toBeVisible()
  await expect(bar).toHaveValue("xyzzy not a food")
})

test("the packaged group never blocks hand entry, and searching writes nothing", async ({
  page,
}) => {
  await page.goto("/meals")

  // Count the library before.
  await pageAction(page, "Food library")
  const libraryRows = page.locator("li").filter({ has: page.locator("button") })
  const before = await libraryRows.count()
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Log food" }).click()
  const search = page.getByPlaceholder(/search foods/i)

  // Under two characters nothing is searched, and the bar says so.
  await search.fill("a")
  await expect(page.getByText(/type to search/i)).toBeVisible()

  // Armed BEFORE typing: awaiting the round trip proves a search ran before the count
  // below is read. Whether Open Food Facts ANSWERS is irrelevant — the action responds
  // either way, which is what makes this safe with the network down.
  const searched = serverWrite(page, (body) => body.includes("yogurt"))
  await search.fill("yogurt")
  await searched
  await expect(
    page.getByText("Packaged products", { exact: true }),
  ).toBeVisible()

  // The form is fully usable while the groups sit there: an unreachable food database
  // must never stand between the user and logging a meal.
  const name = `e2edb${Date.now()}`
  await page.getByLabel("Food", { exact: true }).fill(name)
  await page.getByLabel("Serving", { exact: true }).fill("1 bowl")
  await page.getByLabel("Calories", { exact: true }).fill("123")
  await page.getByRole("checkbox", { name: /save as a new food/i }).uncheck()
  await page.getByRole("button", { name: "Log", exact: true }).click()

  const row = page.locator(rows(name)).first()
  await expect(row).toBeVisible()
  await row.getByRole("button", { name: "Entry actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(page.locator(rows(name))).toHaveCount(0)

  // Searching wrote nothing: import is the form's submit, never a keystroke (ADR-0005).
  await pageAction(page, "Food library")
  await expect(libraryRows).toHaveCount(before)
  await page.keyboard.press("Escape")
})
