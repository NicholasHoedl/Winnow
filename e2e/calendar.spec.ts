import { test, expect } from "./_test"

import { deleteEventsMatching } from "./_events"

// A safety net, NOT the cleanup. Deleting the event is this test's second half and stays in
// the body where it is asserted — but an assertion that throws before reaching it used to
// leak an event onto today's calendar for every later spec, and today is the one date the
// dashboard specs all read.
test.afterEach(async () => {
  await deleteEventsMatching("E2E event")
})

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
