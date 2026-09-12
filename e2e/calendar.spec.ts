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

/**
 * T36 (Tesler): the date you are looking at is the date a new event starts on.
 *
 * A far-future month, so today is nowhere in the grid and the answer is deterministic
 * whenever the suite runs. Nothing is saved — the dialog is opened and cancelled.
 */
test("Add event starts from the day being viewed, not from today", async ({
  page,
}) => {
  await page.goto("/calendar?view=month&date=2027-06-15")
  await page.getByRole("button", { name: "Add event" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByLabel("Starts")).toHaveValue("2027-06-15")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await dialog.waitFor({ state: "hidden" })
})

// `?new=event` is what the dashboard and the palette link to, so those two "Add event"
// buttons make an event rather than showing you where events are made. The flag is taken
// back out of the URL afterwards — a reload must not reopen the dialog — and the view and
// date it arrived with are left alone.
test("a flagged link opens the event dialog and tidies the URL after itself", async ({
  page,
}) => {
  await page.goto("/calendar?view=week&date=2027-06-15&new=event")

  const dialog = page.getByRole("dialog", { name: "Add event" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel("Starts")).toHaveValue("2027-06-15")
  await expect(page).toHaveURL(/\/calendar\?view=week&date=2027-06-15$/)

  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await dialog.waitFor({ state: "hidden" })
  await page.reload()
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("the dashboard's Add event opens the dialog on the calendar", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("link", { name: "Add event" }).click()

  await expect(page).toHaveURL(/\/calendar/)
  await expect(page.getByRole("dialog", { name: "Add event" })).toBeVisible()
})
