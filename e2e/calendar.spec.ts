import { test, expect } from "./_test"

import {
  deleteCalendarsMatching,
  deleteEventsMatching,
  seedCalendar,
  seedEvent,
} from "./_events"
import { noToast } from "./_toast"

// A safety net, NOT the cleanup. Deleting the event is this test's second half and stays in
// the body where it is asserted — but an assertion that throws before reaching it used to
// leak an event onto today's calendar for every later spec, and today is the one date the
// dashboard specs all read.
test.afterEach(async () => {
  await deleteEventsMatching("E2E event")
  // Calendars cascade their events, so this is both cleanups in one — and it runs on a
  // failure too, where the test may have left a calendar the app refuses to be without.
  await deleteCalendarsMatching("E2E calendar")
})

/**
 * T42 (Pass 8): deleting a calendar deletes its events, and used to do it on one click
 * with nothing said. The FK cascade is invisible from the row — the manager lists a name
 * and a colour — so the events went with it before anyone could know they would.
 */
test("deleting a calendar names what goes with it, and Cancel keeps both", async ({
  page,
}) => {
  const stamp = Date.now()
  const name = `E2E calendar ${stamp}`
  const title = `E2E event on ${stamp}`
  const calendarId = await seedCalendar(name)
  await seedEvent({ title, calendarId, date: "2027-06-15" })
  await seedEvent({ title: `${title} two`, calendarId, date: "2027-06-16" })

  await page.goto("/calendar?view=month&date=2027-06-15")
  const chip = page.getByRole("button").filter({ hasText: title })
  await expect(chip.first()).toBeVisible()

  await page.getByRole("button", { name: "Manage calendars" }).click()
  await page.getByRole("button", { name: `Delete ${name}` }).click()

  // The count is the whole point: a cascade nobody was told about is the mistake.
  // `alertdialog`, which `getByRole("dialog")` does not find.
  const confirm = page.getByRole("alertdialog")
  await expect(confirm).toContainText(
    `“${name}” and the 2 events on it will be deleted.`,
  )

  // Cancel keeps both, and says nothing — a toast here would read as a delete.
  await confirm.getByRole("button", { name: "Cancel" }).click()
  await expect(
    page.getByRole("button", { name: `Delete ${name}` }),
  ).toBeVisible()
  await noToast(page)
  await page.keyboard.press("Escape")
  await expect(chip.first()).toBeVisible()

  // And confirming takes the calendar and its events together.
  await page.getByRole("button", { name: "Manage calendars" }).click()
  await page.getByRole("button", { name: `Delete ${name}` }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete calendar" })
    .click()
  await expect(
    page.getByRole("button", { name: `Delete ${name}` }),
  ).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(chip).toHaveCount(0)
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

/**
 * T38 (Pass 4, uniform connectedness): the event dialog's actions are the app's footer.
 *
 * Twelve of the app's twenty dialogs stack a full-width primary over a full-width Cancel on
 * a phone; this one drew the pair small and left-aligned inside its footer strip, so the two
 * buttons read as a fragment of the form rather than as the dialog's decision. Desktop is
 * unchanged — the pair still sits at the right, opposite Delete.
 *
 * Nothing is saved: the dialog is opened and cancelled.
 */
test("the event dialog's actions stack full width on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto("/calendar")
  await page.getByRole("button", { name: "Add event" }).click()

  const dialog = page.getByRole("dialog")
  const add = dialog.getByRole("button", { name: "Add", exact: true })
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true })
  const addBox = (await add.boundingBox())!
  const cancelBox = (await cancel.boundingBox())!

  expect(Math.round(addBox.width), "Add's width").toBeGreaterThanOrEqual(300)
  expect(Math.round(cancelBox.width), "Cancel's width").toBeGreaterThanOrEqual(
    300,
  )
  expect(
    Math.round(addBox.y + addBox.height),
    "Add sits above Cancel",
  ).toBeLessThanOrEqual(Math.round(cancelBox.y))

  await cancel.click()
  await dialog.waitFor({ state: "hidden" })
})
