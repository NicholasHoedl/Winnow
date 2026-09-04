import { test, expect } from "./_test"

import { visibleCard } from "./_card"
import { dashboardHeading } from "./_login"

// Browser coverage for the ⌘K command palette (T1-S3): open/close, the visible
// trigger, page-jump commands, cross-module search, and the `g`-then-letter nav.
const PLACEHOLDER = /search tasks, events, foods/i

test("opens from the trigger and closes with Escape", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Search" }).first().click()

  const input = page.getByPlaceholder(PLACEHOLDER)
  await expect(input).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(input).toBeHidden()
})

test("opens with the Ctrl+K shortcut", async ({ page }) => {
  await page.goto("/")
  await expect(dashboardHeading(page)).toBeVisible()

  await page.keyboard.press("Control+k")
  await expect(page.getByPlaceholder(PLACEHOLDER)).toBeVisible()
})

test("jumps to a page via a nav command", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Search" }).first().click()
  await page.getByPlaceholder(PLACEHOLDER).fill("Settings")

  await page.getByRole("option", { name: "Settings" }).click()
  await expect(page).toHaveURL(/\/settings$/)
})

test("g then b navigates to Budget", async ({ page }) => {
  await page.goto("/")
  await expect(dashboardHeading(page)).toBeVisible()

  await page.keyboard.press("g")
  await page.keyboard.press("b")
  await expect(page).toHaveURL(/\/budget$/)
})

test("searches across modules and opens a result", async ({ page }) => {
  const title = `E2E palette ${Date.now()}`

  // Seed a task to find.
  await page.goto("/activity")
  const quickAdd = page.getByLabel("Quick add task")
  await quickAdd.fill(title)
  await quickAdd.press("Enter")
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible()

  // Find it from the palette.
  await page.getByRole("button", { name: "Search" }).first().click()
  await page.getByPlaceholder(PLACEHOLDER).fill(title)

  const result = page.getByRole("option", { name: new RegExp(title) })
  await expect(result).toBeVisible()
  await page.screenshot({ path: "test-results/command-palette.png" })
  await result.click()
  await expect(page).toHaveURL(/\/activity$/)

  // Cleanup: delete the seeded task ("All" shows every row regardless of status).
  await page.getByRole("button", { name: "All", exact: true }).click()
  const row = visibleCard(page, title)
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(visibleCard(page, title)).toHaveCount(0)
})

/**
 * T12d: habits reach the palette.
 *
 * Until now a habit was findable only by already being on `/activity/habits`, which is the
 * one place you do not need to search for it. The `Habit` badge is worth asserting as well
 * as the hit itself — it comes from an exhaustive `Record<SearchResultType, string>`, so a
 * result rendering with a blank label would mean the union and that map had drifted.
 */
test("finds a habit and offers a command to create one", async ({ page }) => {
  const title = `E2E palette habit ${Date.now()}`

  await page.goto("/activity/habits")
  await page.getByRole("button", { name: "New habit", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(title)
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(visibleCard(page, title)).toHaveCount(1)

  await page.goto("/")
  await page.getByRole("button", { name: "Search" }).first().click()
  await page.getByPlaceholder(PLACEHOLDER).fill(title)

  const result = page.getByRole("option", { name: new RegExp(title) })
  await expect(result).toBeVisible()
  await expect(result).toContainText("Habit")
  await result.click()
  await expect(page).toHaveURL(/\/activity\/habits$/)

  // The create command, which is how a habit gets made without knowing the route.
  await page.getByRole("button", { name: "Search" }).first().click()
  await page.getByPlaceholder(PLACEHOLDER).fill("New habit")
  await expect(page.getByRole("option", { name: "New habit" })).toBeVisible()
  await page.keyboard.press("Escape")

  await visibleCard(page, title)
    .getByRole("button", { name: `${title} actions` })
    .click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await page.getByRole("button", { name: "Delete habit", exact: true }).click()
  await expect(visibleCard(page, title)).toHaveCount(0)
})
