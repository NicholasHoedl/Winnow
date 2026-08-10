import { test, expect } from "./_test"

import { visibleCard } from "./_card"

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
  await expect(
    page.getByRole("heading", { name: /good to see you/i }),
  ).toBeVisible()

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
  await expect(
    page.getByRole("heading", { name: /good to see you/i }),
  ).toBeVisible()

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
