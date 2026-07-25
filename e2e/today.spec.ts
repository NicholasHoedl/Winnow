import { test, expect } from "@playwright/test"

// Browser coverage for T2-S4: the Today hub renders the merged agenda and its tasks
// stay actionable there (quick-add defaults a new task to today).

test("the today hub lists a task due today and completes it in place", async ({
  page,
}) => {
  const title = `E2E today ${Date.now()}`

  await page.goto("/todos")
  const input = page.getByLabel("Quick add task")
  await input.fill(title)
  await input.press("Enter")
  await expect(
    page.locator("div.bg-card").filter({ hasText: title }),
  ).toBeVisible()

  await page.goto("/today")
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 }),
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible()

  // Completing from the hub flips the row (the label swaps with the state).
  const complete = page.getByLabel(`Complete ${title}`)
  await expect(complete).toBeVisible()
  await complete.click()
  await expect(page.getByLabel(`Reopen ${title}`)).toBeVisible()

  // Cleanup via the todos list.
  await page.goto("/todos")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const row = page.locator("div.bg-card").filter({ hasText: title })
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(
    page.locator("div.bg-card").filter({ hasText: title }),
  ).toHaveCount(0)
})
