import { test, expect } from "@playwright/test"

// Browser coverage for T2-S6: the digest banner fires once on the first visit of a
// new local day, and dismissing it sticks for the rest of that day.

// The storage key is namespaced by user id, which the test doesn't know — clear the
// whole prefix to simulate "never seen today".
const CLEAR_SEEN = `
  Object.keys(window.localStorage)
    .filter((k) => k.startsWith("winnow:digest-seen:"))
    .forEach((k) => window.localStorage.removeItem(k))
`

test("the daily digest appears once a day and stays dismissed", async ({
  page,
}) => {
  const title = `E2E digest ${Date.now()}`

  // Give the digest something worth reporting: a task due TODAY.
  // The dialog prefills today's date; quick-add deliberately does not (T5a-S6 made it
  // capture-into-Someday), and this spec needs a task that is actually due today.
  await page.goto("/todos")
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(title)
  await dialog.getByRole("button", { name: "Create" }).click()
  await expect(
    page.locator("div.bg-card").filter({ hasText: title }),
  ).toBeVisible()

  // Pretend this is the first load of a new day.
  await page.evaluate(CLEAR_SEEN)
  await page.reload()

  const banner = page.getByRole("status").filter({ hasText: "Daily digest" })
  await expect(banner).toBeVisible()
  // It summarises the task we just created rather than rendering an empty shell.
  await expect(banner).toContainText(/\d+ task/)
  await expect(banner).toContainText("due today")

  // Dismissing hides it immediately...
  await page.getByLabel("Dismiss digest").click()
  await expect(banner).toBeHidden()

  // ...and the day is already recorded, so a reload doesn't bring it back.
  await page.reload()
  await expect(page.getByText("Daily digest")).toHaveCount(0)

  // Cleanup.
  await page.goto("/todos")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const row = page.locator("div.bg-card").filter({ hasText: title })
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(
    page.locator("div.bg-card").filter({ hasText: title }),
  ).toHaveCount(0)
})
