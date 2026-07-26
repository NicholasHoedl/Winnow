import { test, expect } from "@playwright/test"

// Browser coverage for T4-S6.
//
// Deliberately asserts ONLY offline-safe behaviour. The Open Food Facts request happens
// inside a Server Action, on the server — so `page.route()` cannot intercept it, and a
// spec that expected real results would need the internet to pass. A self-hosted app's
// test suite must not. Live search is a manual check, recorded in the step.
//
// What is checked here is everything that does not depend on OFF answering: the panel
// renders in both places, a too-short query never leaves the browser, searching writes
// nothing, and the hand-entry fields stay usable regardless of what the database does.

test("the food-database panel appears without blocking hand entry", async ({
  page,
}) => {
  await page.goto("/meals")
  await page.getByRole("button", { name: "Log food" }).click()

  const search = page.getByPlaceholder(/search open food facts/i)
  await expect(search).toBeVisible()

  // Under two characters the component answers locally — no request, and it says so.
  await search.fill("a")
  await expect(page.getByText("Type at least two letters.")).toBeVisible()

  // The rest of the dialog is fully usable while the panel sits there: an unreachable
  // food database must never stand between the user and logging a meal.
  const name = `e2edb${Date.now()}`
  await page.getByLabel("Food", { exact: true }).fill(name)
  await page.getByLabel("Serving", { exact: true }).fill("1 bowl")
  await page.getByLabel("Calories", { exact: true }).fill("123")
  await page.getByRole("checkbox", { name: /save as a new food/i }).uncheck()
  await page.getByRole("button", { name: "Log", exact: true }).click()

  const row = page.locator("div.bg-card").filter({ hasText: name })
  await expect(row).toBeVisible()

  await row.getByRole("button", { name: "Entry actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row).toHaveCount(0)
})

test("searching the food database writes nothing to the library", async ({
  page,
}) => {
  await page.goto("/meals")

  // Count the library before.
  await page.getByRole("button", { name: "Food library" }).click()
  const libraryRows = page.locator("li").filter({ has: page.locator("button") })
  const before = await libraryRows.count()

  // Type a real query. Whether OFF answers or not is irrelevant — either way this must
  // not create a row, because import is a separate, explicit act (ADR-0005).
  const search = page.getByPlaceholder(/search open food facts/i)
  await expect(search).toBeVisible()
  await search.fill("yogurt")
  await page.waitForTimeout(1500)

  await expect(libraryRows).toHaveCount(before)
})
