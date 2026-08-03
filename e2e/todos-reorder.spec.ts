import { test, expect } from "./_test"

import { visibleCard } from "./_card"

// Browser coverage for T5a-S7: manual reorder.
//
// The reason @dnd-kit is a dependency in a codebase that hand-rolls its charts and date
// maths is that native HTML5 drag events don't fire on touch, and this is an installed
// iOS PWA (ADR-0006). So the KEYBOARD path is tested too — it's dnd-kit's other
// justification, and the part a hand-rolled pointer implementation would have had to
// build from nothing.

const STAMP = Date.now()
const NAMES = ["alpha", "bravo", "charlie"].map(
  (n) => `E2E order ${n} ${STAMP}`,
)

/** Titles in the Someday section, top to bottom. */
async function somedayOrder(page: import("@playwright/test").Page) {
  // Scoped to `#content`. React's streaming staging div (`<div hidden id="S:n">`) sits at
  // body level, so an unscoped `section` matches the real one AND the staged copy — and
  // this reads via innerText(), which throws on a strict-mode violation instead of
  // retrying. See e2e/_test.ts.
  const section = page
    .locator("#content section")
    .filter({ hasText: "Someday" })
  const text = await section.innerText()
  return NAMES.filter((name) => text.includes(name)).sort(
    (a, b) => text.indexOf(a) - text.indexOf(b),
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto("/todos")
  for (const name of NAMES) {
    const input = page.getByLabel("Quick add task")
    await input.fill(name)
    await input.press("Enter")
    await expect(visibleCard(page, name)).toHaveCount(1)
  }
})

test.afterEach(async ({ page }) => {
  await page.goto("/todos")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const strays = visibleCard(page, `E2E order `)
  for (let i = 0; i < 12; i++) {
    const before = await strays.count()
    if (before === 0) break
    await strays.first().getByRole("button", { name: "Task actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(strays).toHaveCount(before - 1)
    await page.reload()
    await page.getByRole("button", { name: "All", exact: true }).click()
  }
  await expect(strays).toHaveCount(0)
})

test("a task can be dragged to a new position, and it persists", async ({
  page,
}) => {
  const before = await somedayOrder(page)
  expect(before).toHaveLength(3)

  // Drag the LAST one to the top.
  const handle = page.getByRole("button", { name: `Reorder ${before[2]}` })
  const target = page.getByRole("button", { name: `Reorder ${before[0]}` })
  await handle.hover()
  await page.mouse.down()
  // Two moves: dnd-kit needs one to cross the activation threshold and one to register
  // the position, and a single jump can land before the sensor has engaged.
  const box = await target.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, {
    steps: 10,
  })
  await page.mouse.move(box!.x + box!.width / 2, box!.y - 4, { steps: 5 })
  await page.mouse.up()

  await expect.poll(async () => (await somedayOrder(page))[0]).toBe(before[2])

  // The order came from the server, not from local state.
  await page.reload()
  expect((await somedayOrder(page))[0]).toBe(before[2])
})

test("the same reorder is possible from the keyboard", async ({ page }) => {
  const before = await somedayOrder(page)
  expect(before).toHaveLength(3)

  // Space lifts, ArrowDown moves, Space drops — dnd-kit's keyboard sensor. The waits are
  // load-bearing: the sensor needs a tick between the lift and the move, and pressing
  // straight through makes the arrow arrive before the drag is active. dnd-kit announces
  // each step into a live region, which is how that was diagnosed.
  await page.getByRole("button", { name: `Reorder ${before[0]}` }).focus()
  await page.keyboard.press("Space")
  await page.waitForTimeout(200)
  await page.keyboard.press("ArrowDown")
  await page.waitForTimeout(200)
  await page.keyboard.press("Space")

  await expect.poll(async () => (await somedayOrder(page))[0]).toBe(before[1])
  await page.reload()
  expect((await somedayOrder(page))[0]).toBe(before[1])
})
