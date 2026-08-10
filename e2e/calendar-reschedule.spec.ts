import { test, expect, type Page } from "./_test"

// Browser coverage for T5b-S6: drag-to-reschedule in the week grid.
//
// The load-bearing assertion is the RELOAD, twice over. A drop paints optimistically
// while the Server Action is still in flight, so "the block is on Thursday now" is true
// a frame after the mouse comes up whether or not anything was written. Only a reload
// reads the database back.
//
// The keyboard path is tested for the same reason it is in e2e/activity-reorder.spec.ts:
// it is half of why @dnd-kit is a dependency at all (ADR-0006), and it is the half that
// silently rots, because nothing else in the suite would notice it break.

const PREFIX = "E2E move"

// A fixed far-future Wednesday. See e2e/calendar-week.spec.ts for why test events do
// not go on today; and it is deliberately nowhere near a DST transition, so a failure
// here means the drag is wrong rather than the calendar.
const DAY = "2027-04-14"
const NEXT_DAY = "2027-04-15"

test.afterEach(async ({ page }) => {
  // The day view, and only after the page has actually rendered — see
  // e2e/calendar-week.spec.ts, where a cleanup that ran too early deleted nothing and
  // reported success. Both days are swept because the point of the test is to move
  // events between them.
  for (const date of [DAY, NEXT_DAY]) {
    await page.goto(`/calendar?view=day&date=${date}`)
    await expect(page.getByRole("button", { name: "Add event" })).toBeVisible()
    const strays = page.getByRole("button").filter({ hasText: PREFIX })
    for (let i = 0; i < 10; i++) {
      const before = await strays.count()
      if (before === 0) break
      await strays.first().click()
      const dialog = page.getByRole("dialog")
      // Wait for it before reaching inside. Nothing below auto-waits usefully once the
      // locator is wrong, and "Delete" without `exact` would also match the recurring
      // scopes' "Delete from here".
      await expect(dialog).toBeVisible()
      await dialog.getByRole("button", { name: "Delete", exact: true }).click()
      await expect(strays).toHaveCount(before - 1)
    }
    await expect(strays).toHaveCount(0)
  }
})

async function addEvent(page: Page, title: string) {
  await page.goto("/calendar")
  await page.getByRole("button", { name: "Add event" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title").fill(title)
  await dialog.getByLabel("Starts").fill(DAY)
  await dialog.getByLabel("Ends").fill(DAY)
  await dialog.getByLabel("Start time").fill("09:00")
  await dialog.getByLabel("End time").fill("10:00")
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

/** The block's column index and top fraction, measured through the real layout. */
async function placement(page: Page, title: string) {
  const block = page.getByRole("button", { name: new RegExp(title) })
  await expect(block).toHaveCount(1)
  return block.evaluate((node) => {
    const el = node as HTMLElement
    const parent = el.offsetParent as HTMLElement
    return {
      top: el.offsetTop / parent.offsetHeight,
      left: Math.round(parent.getBoundingClientRect().left),
    }
  })
}

test("a block can be dragged to another day and time, and it sticks", async ({
  page,
}) => {
  const title = `${PREFIX} drag ${Date.now()}`
  await addEvent(page, title)
  await page.goto(`/calendar?view=week&date=${DAY}`)

  const start = await placement(page, title)
  expect(start.top).toBeCloseTo(9 / 24, 2)

  // Drop it one column right and two hours down. Both distances are measured off the
  // block's own column rather than guessed, so this holds at any viewport and whatever
  // the hour-row height resolves to.
  const block = page.getByRole("button", { name: new RegExp(title) })
  const box = (await block.boundingBox())!
  const { columnWidth, hourHeight } = await block.evaluate((node) => {
    const column = (node as HTMLElement).offsetParent as HTMLElement
    const rect = column.getBoundingClientRect()
    return { columnWidth: rect.width, hourHeight: rect.height / 24 }
  })
  expect(columnWidth).toBeGreaterThan(0)

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  // Two moves: dnd-kit needs one to cross the 4px activation threshold and one to
  // register the position. A single jump can land before the sensor has engaged.
  await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2, {
    steps: 5,
  })
  await page.mouse.move(
    box.x + box.width / 2 + columnWidth,
    box.y + box.height / 2 + hourHeight * 2,
    { steps: 12 },
  )
  await page.mouse.up()

  await expect
    .poll(async () => (await placement(page, title)).top, { timeout: 10_000 })
    .toBeCloseTo(11 / 24, 2)

  // THE point of the test: it came from the database, not from the optimistic paint.
  await page.reload()
  const after = await placement(page, title)
  expect(after.top).toBeCloseTo(11 / 24, 2)
  expect(after.left).toBeGreaterThan(start.left)

  // And it is on the next day specifically, not just somewhere to the right.
  await page.goto(`/calendar?view=day&date=${NEXT_DAY}`)
  await expect(
    page.getByRole("button", { name: new RegExp(title) }),
  ).toHaveCount(1)
})

test("the same move is possible from the keyboard", async ({ page }) => {
  const title = `${PREFIX} keys ${Date.now()}`
  await addEvent(page, title)
  await page.goto(`/calendar?view=week&date=${DAY}`)
  expect((await placement(page, title)).top).toBeCloseTo(9 / 24, 2)

  // Space lifts, arrows move, Space drops. Enter is deliberately NOT the lift key here
  // — it still opens the editor, because the block is its own drag handle.
  //
  // The waits are load-bearing, exactly as in todos-reorder: the sensor needs a tick
  // between the lift and the first move, and pressing straight through delivers the
  // arrow before the drag is active.
  await page.getByRole("button", { name: new RegExp(title) }).focus()
  await page.keyboard.press("Space")
  await page.waitForTimeout(200)
  await page.keyboard.press("ArrowRight")
  await page.waitForTimeout(100)
  // Four 15-minute slots — one hour.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("ArrowDown")
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(150)
  await page.keyboard.press("Space")

  await expect
    .poll(async () => (await placement(page, title)).top, { timeout: 10_000 })
    .toBeCloseTo(10 / 24, 2)

  await page.reload()
  expect((await placement(page, title)).top).toBeCloseTo(10 / 24, 2)
  await page.goto(`/calendar?view=day&date=${NEXT_DAY}`)
  await expect(
    page.getByRole("button", { name: new RegExp(title) }),
  ).toHaveCount(1)
})
