import { test, expect, type Page } from "./_test"

import { deleteEventsMatching } from "./_events"

// Browser coverage for T5b-S3/S4: the week time-grid and the URL that reaches it.
//
// The load-bearing assertion is the POSITION one. Every other calendar view is a chip
// list keyed on a date string, where "the event is on screen" is the whole story; a
// time grid is only useful if the block is at the right HEIGHT, and a geometry unit
// test cannot prove that the numbers it returns ever reach CSS. So the spec measures
// the rendered block against its column through the real layout engine.

/** Events created here all share this prefix so cleanup can find them. */
const PREFIX = "E2E week"

// A fixed far-future Wednesday rather than today. The dev database is persistent and
// already busy, and the month grid caps a day at three chips — putting test events on
// today buries both them and everyone else's behind a "+N more", which is how an
// earlier version of this spec broke `calendar.spec.ts` from three rooms away. It is
// also deliberately nowhere near a DST transition; the grid's DST behaviour is covered
// by unit tests, and a spec that quietly depended on it would be testing two things.
const DAY = "2027-03-10"

// Cleanup lives in afterEach rather than at the end of the body: a failing assertion
// aborts the test, and a leaked event stays on the calendar for every later run.
//
// It sweeps the DATABASE rather than the calendar. This used to open the day view and
// delete up to twenty chips one at a time, and the two long comments that stood here were
// both scars from that: the day view had to be used because the month grid's three-chip cap
// made the count never move, and the render had to be awaited because a `toHaveCount(0)`
// that is already true passes instantly on a page still showing `loading.tsx` — which it
// once did, silently leaving rows behind. Neither hazard exists for a `delete` statement.
test.afterEach(async () => {
  await deleteEventsMatching(PREFIX)
})

/** Add an event on {@link DAY} via the dialog. */
async function addEvent(
  page: Page,
  title: string,
  times?: { start: string; end: string },
) {
  await page.getByRole("button", { name: "Add event" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title").fill(title)
  await dialog.getByLabel("Starts").fill(DAY)
  await dialog.getByLabel("Ends").fill(DAY)
  if (times) {
    await dialog.getByLabel("Start time").fill(times.start)
    await dialog.getByLabel("End time").fill(times.end)
  } else {
    // By role, not label: base-ui renders a visual span AND a hidden input, and
    // getByLabel matches both.
    await dialog.getByRole("checkbox", { name: "All day" }).check()
  }
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

test("a timed event sits at its hour and an all-day event sits in the gutter", async ({
  page,
}) => {
  const stamp = Date.now()
  const timed = `${PREFIX} timed ${stamp}`
  const allDay = `${PREFIX} allday ${stamp}`

  await page.goto("/calendar")
  await addEvent(page, timed, { start: "14:00", end: "15:00" })
  await addEvent(page, allDay)

  await page.goto(`/calendar?view=week&date=${DAY}`)

  // --- The timed block is where 14:00 is, measured against its own column.
  const block = page.getByRole("button", { name: new RegExp(timed) })
  await expect(block).toHaveCount(1)
  const box = await block.evaluate((node) => {
    const el = node as HTMLElement
    const parent = el.offsetParent as HTMLElement
    return {
      top: el.offsetTop / parent.offsetHeight,
      height: el.offsetHeight / parent.offsetHeight,
    }
  })
  expect(box.top).toBeCloseTo(14 / 24, 2)
  expect(box.height).toBeCloseTo(1 / 24, 2)

  // --- And it says when it is, since the hour gutter beside it is decoration a
  // screen reader is never given. Either clock format is fine — that's a preference.
  await expect(block).toHaveAttribute(
    "aria-label",
    /(14:00 to 15:00|2:00 PM to 3:00 PM)/,
  )

  // --- The all-day event is in the gutter, and specifically NOT in the hour grid:
  // it has no time to be positioned by, and placing it at midnight would be a lie.
  const gutter = page.getByRole("group", { name: "All-day events" })
  await expect(
    gutter.getByRole("button", { name: new RegExp(allDay) }),
  ).toHaveCount(1)
  await expect(
    gutter.getByRole("button", { name: new RegExp(timed) }),
  ).toHaveCount(0)
})

test("the week view is linkable, survives a reload, and steps a week at a time", async ({
  page,
}) => {
  // The view used to be component state, where none of this held: a reload dropped
  // you back on the month and there was no URL to send anyone.
  await page.goto("/calendar")
  await page.getByRole("link", { name: "week", exact: true }).click()
  await expect(page).toHaveURL(/view=week/)

  const title = page.locator("span.min-w-52")
  const shown = await title.textContent()

  await page.reload()
  await expect(page).toHaveURL(/view=week/)
  await expect(title).toHaveText(shown!)

  // Stepping moves a week, not a month, and back returns to where it started.
  await page.getByRole("link", { name: "Next week" }).click()
  await expect(title).not.toHaveText(shown!)
  await page.goBack()
  await expect(title).toHaveText(shown!)
})
