import { test, expect } from "./_test"

// Exercises the event dialog + Server Action + grid render through a real browser
// (the manual harness couldn't drive base-ui popovers reliably in a hidden tab).
test("create and delete a calendar event", async ({ page }) => {
  const title = `E2E event ${Date.now()}`
  await page.goto("/calendar")

  await page.getByRole("button", { name: "Add event" }).click()
  await page.getByLabel("Title").fill(title)
  // Date/time/recurrence keep their valid defaults (today, 09:00, does not repeat).
  await page.getByRole("button", { name: "Add", exact: true }).click()

  const chip = page.getByRole("button").filter({ hasText: title })
  await expect(chip.first()).toBeVisible()

  // Clean up: open the event and delete it.
  await chip.first().click()
  await page.getByRole("button", { name: "Delete" }).click()
  await expect(page.getByRole("button").filter({ hasText: title })).toHaveCount(
    0,
  )
})
