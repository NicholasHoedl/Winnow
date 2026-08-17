import { test, expect, type Page } from "./_test"

import { deleteEventsMatching } from "./_events"

// Browser coverage for T5b-S7/S8: "this and following".
//
// This is also the FIRST test of the split transaction. Its three writes — truncate the
// original, insert the continuation, re-point the exceptions — are individually
// unremarkable and collectively the whole feature: a truncate that lands alone silently
// deletes every future occurrence, and a continuation that lands alone renders the
// series twice from the split onward. Nothing below asserts on the transaction directly;
// it asserts on what the calendar shows, which is the only thing that matters.

const PREFIX = "E2E split"

// A fixed far-future Wednesday, well clear of both DST transitions and of anything in
// the dev database. See e2e/calendar-week.spec.ts for why test events never go on today.
const D0 = "2027-09-08"
const D1 = "2027-09-09"
const D2 = "2027-09-10" // the split point
const D4 = "2027-09-12"

// One statement, in the database. This used to sweep the UI — four day-view navigations
// because a split leaves two series covering different days, and per day up to eight rounds
// of open, switch scope to "All events", Delete, re-count. It was the most expensive teardown
// in the suite and the first thing to time out whenever the machine was busy, which turned
// every real failure here into two: the test, and then a 60s `afterEach` timeout on the extra
// strays the failure had left behind. See `_events.ts` for why skipping the UI costs no
// coverage.
test.afterEach(async () => {
  await deleteEventsMatching(PREFIX)
})

/** A daily series at 09:00–10:00 starting on {@link D0}. */
async function addDailySeries(page: Page, title: string) {
  await page.goto("/calendar")
  await page.getByRole("button", { name: "Add event" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title").fill(title)
  await dialog.getByLabel("Starts").fill(D0)
  await dialog.getByLabel("Ends").fill(D0)
  await dialog.getByLabel("Start time").fill("09:00")
  await dialog.getByLabel("End time").fill("10:00")
  await dialog
    .getByRole("combobox")
    .filter({ hasText: "Does not repeat" })
    .click()
  await page.getByRole("option", { name: "Daily", exact: true }).click()
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

/** Open one day and measure where the block sits, as a fraction of the column. */
async function topOn(page: Page, date: string, title: string): Promise<number> {
  await page.goto(`/calendar?view=day&date=${date}`)
  const block = page.getByRole("button", { name: new RegExp(title) })
  await expect(block).toHaveCount(1)
  return block.evaluate((node) => {
    const el = node as HTMLElement
    return el.offsetTop / (el.offsetParent as HTMLElement).offsetHeight
  })
}

/** How many blocks with this title the given day shows. */
async function countOn(page: Page, date: string, title: string) {
  await page.goto(`/calendar?view=day&date=${date}`)
  await expect(page.getByRole("button", { name: "Add event" })).toBeVisible()
  return page.getByRole("button", { name: new RegExp(title) }).count()
}

/** Open the occurrence on `date` and pick an edit scope. */
async function openWithScope(
  page: Page,
  date: string,
  title: string,
  scope: string,
) {
  await page.goto(`/calendar?view=day&date=${date}`)
  await page.getByRole("button", { name: new RegExp(title) }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: scope, exact: true }).click()
  return dialog
}

test("editing from the middle changes later days and leaves earlier ones alone", async ({
  page,
}) => {
  const title = `${PREFIX} time ${Date.now()}`
  await addDailySeries(page, title)
  expect(await topOn(page, D1, title)).toBeCloseTo(9 / 24, 2)

  const dialog = await openWithScope(page, D2, title, "This and following")
  await dialog.getByLabel("Start time").fill("14:00")
  await dialog.getByLabel("End time").fill("15:00")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog).toHaveCount(0)

  // Every assertion below is a fresh page load, so all of it is read back from the
  // database rather than from anything the client is still holding.
  expect(await topOn(page, D0, title)).toBeCloseTo(9 / 24, 2) // before the split
  expect(await topOn(page, D1, title)).toBeCloseTo(9 / 24, 2)
  expect(await topOn(page, D2, title)).toBeCloseTo(14 / 24, 2) // the split day itself
  expect(await topOn(page, D4, title)).toBeCloseTo(14 / 24, 2)

  // toHaveCount(1) inside topOn already carries this, but state it plainly: exactly one
  // occurrence per day. Two would mean the truncate never landed and both halves are
  // rendering over each other.
  await page.goto(`/calendar?view=day&date=${D4}`)
  await expect(
    page.getByRole("button", { name: new RegExp(title) }),
  ).toHaveCount(1)
})

test("deleting from here truncates the series, and undo puts it back", async ({
  page,
}) => {
  // The truncating half of the split, and the one place in this tranche where undo has
  // a shape of its own: there is no row to restore, only a recurrence end to put back.
  const title = `${PREFIX} cut ${Date.now()}`
  await addDailySeries(page, title)

  // Undo goes FIRST, while the toast is still up — any navigation dismisses it, so
  // checking the truncation across days beforehand would throw the undo away.
  let dialog = await openWithScope(page, D2, title, "This and following")
  await dialog.getByRole("button", { name: "Delete from here" }).click()
  await expect(dialog).toHaveCount(0)

  const block = page.getByRole("button", { name: new RegExp(title) })
  await expect(block).toHaveCount(0) // gone from the day it was cut at
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(block).toHaveCount(1)

  // Back for real rather than re-rendered: these are fresh page loads.
  expect(await countOn(page, D2, title)).toBe(1)
  expect(await countOn(page, D4, title)).toBe(1)

  // Now cut it and leave it cut.
  dialog = await openWithScope(page, D2, title, "This and following")
  await dialog.getByRole("button", { name: "Delete from here" }).click()
  await expect(dialog).toHaveCount(0)

  expect(await countOn(page, D1, title)).toBe(1) // before the cut, untouched
  expect(await countOn(page, D2, title)).toBe(0) // the cut day itself
  expect(await countOn(page, D4, title)).toBe(0)
})

test("a per-occurrence edit after the split point survives it", async ({
  page,
}) => {
  // The exception re-point, which is the third write in the transaction and the only
  // one with nothing else to catch it. An override is stored against an EVENT id; if
  // the split leaves it pointing at the truncated original — which no longer produces
  // that day — the override is orphaned and the day silently reverts to the series.
  const title = `${PREFIX} keep ${Date.now()}`
  const renamed = `${title} renamed`
  await addDailySeries(page, title)

  const one = await openWithScope(page, D4, title, "This event")
  await one.getByLabel("Title").fill(renamed)
  await one.getByRole("button", { name: "Save", exact: true }).click()
  await expect(one).toHaveCount(0)

  const following = await openWithScope(page, D2, title, "This and following")
  await following.getByLabel("Start time").fill("14:00")
  await following.getByLabel("End time").fill("15:00")
  await following.getByRole("button", { name: "Save", exact: true }).click()
  await expect(following).toHaveCount(0)

  // The renamed day kept its own title, so its override followed the new series.
  await page.goto(`/calendar?view=day&date=${D4}`)
  await expect(
    page.getByRole("button", { name: new RegExp(renamed) }),
  ).toHaveCount(1)
  // …and it kept its own 09:00 too, rather than taking the continuation's 14:00.
  expect(await topOn(page, D4, renamed)).toBeCloseTo(9 / 24, 2)
})
