import { test, expect } from "./_test"

import { visibleCard } from "./_card"
import { dashboardHeading } from "./_login"

// Browser coverage for T1-S4: the dashboard natural-language quick-capture bar and the
// three "create a task in place" affordances (n shortcut, palette command, header button).

test("dashboard quick-capture creates a task, parsing the date out of the text", async ({
  page,
}) => {
  const label = `E2E capture ${Date.now()}`
  await page.goto("/")
  await expect(dashboardHeading(page)).toBeVisible()
  await page.screenshot({ path: "test-results/quick-capture.png" })

  const input = page.getByLabel("Quick add a task")
  await input.fill(`${label} tomorrow`)
  await input.press("Enter")

  // Confirmation surfaces the stripped title (the toast, and the refreshed task list).
  await expect(page.getByText(label).first()).toBeVisible()

  // The saved task's title has the "tomorrow" phrase removed.
  await page.goto("/activity")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const row = visibleCard(page, label)
  await expect(row).toBeVisible()
  await expect(row.getByText(`${label} tomorrow`)).toHaveCount(0)

  // Cleanup.
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(visibleCard(page, label)).toHaveCount(0)
})

test("the n shortcut opens the new-task dialog in place", async ({ page }) => {
  await page.goto("/")
  await expect(dashboardHeading(page)).toBeVisible()

  await page.keyboard.press("n")
  await expect(page.getByRole("heading", { name: "New task" })).toBeVisible()
})

test("the palette's New task command opens the dialog", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Search" }).first().click()
  await page.getByRole("option", { name: "New task" }).click()
  await expect(page.getByRole("heading", { name: "New task" })).toBeVisible()
})

test("the dashboard New task button opens the dialog", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "New task" }).click()
  await expect(page.getByRole("heading", { name: "New task" })).toBeVisible()
})
