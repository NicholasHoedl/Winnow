import { test, expect } from "@playwright/test"

// Full write-path through a real browser: quick-add → complete → delete (cleanup).
test("add, complete, and delete a to-do", async ({ page }) => {
  const title = `E2E todo ${Date.now()}`
  await page.goto("/todos")

  const input = page.getByLabel("Quick add task")
  await input.fill(title)
  await input.press("Enter")

  // "Active" (the default) hides completed tasks — switch to "All" so the
  // completed row stays visible to assert on.
  await page.getByRole("button", { name: "All", exact: true }).click()

  const row = page.locator("div.bg-card").filter({ hasText: title })
  await expect(row).toBeVisible()

  // Complete it — the title picks up a line-through.
  await row.getByLabel("Mark as done").click()
  await expect(row.getByText(title, { exact: true })).toHaveClass(/line-through/)

  // Delete it (cleanup) via the row menu.
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(
    page.locator("div.bg-card").filter({ hasText: title }),
  ).toHaveCount(0)
})
