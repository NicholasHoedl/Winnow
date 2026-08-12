import { test, expect } from "./_test"

import { goalCard } from "./_card"

// Browser coverage for T5a-S10: milestone due dates, and reordering goals.
//
// The reorder uses the KEYBOARD path rather than a mouse drag, matching the reasoning in
// todos-reorder.spec.ts: a pointer drag's drop target depends on layout, and the mouse path
// is already covered there for a single-column list.
//
// It asserts that the order CHANGED and survived a reload, rather than predicting the
// resulting permutation — the E2E goals sit among whatever the account already has, so
// pinning an exact expected order would be testing arithmetic the test itself did.
//
// T10 moved goals into the `/activity` rail: a single column, so ArrowDown is now valid
// from any position except the last, and milestones live in the detail dialog rather than
// on the card.

const STAMP = Date.now()
const NAMES = ["alpha", "bravo", "charlie"].map(
  (n) => `E2E gorder ${n} ${STAMP}`,
)

/** The E2E goals, in the order they appear in the rail. */
async function order(page: import("@playwright/test").Page) {
  const text = await page.locator("main, body").first().innerText()
  return NAMES.filter((n) => text.includes(n)).sort(
    (a, b) => text.indexOf(a) - text.indexOf(b),
  )
}

async function addGoal(page: import("@playwright/test").Page, name: string) {
  // Either label — see `_goals.ts`. "Add a goal" is the empty-state button; "Add goal"
  // is the `+` once a goal exists.
  await page.getByRole("button", { name: /^Add (a )?goal$/ }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(name)
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(goalCard(page, name)).toHaveCount(1)
}

/** Delete runs from inside the goal's detail dialog now, not a card menu. */
async function deleteGoal(page: import("@playwright/test").Page, name: string) {
  await goalCard(page, name)
    .getByRole("button", { name: /^Open / })
    .click()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await page.getByRole("button", { name: "Delete goal" }).click()
}

test.afterEach(async ({ page }) => {
  await page.goto("/activity")
  const strays = goalCard(page, "E2E gorder ")
  for (let i = 0; i < 10; i++) {
    const before = await strays.count()
    if (before === 0) break
    const name = (await strays.first().innerText()).split("\n")[0]
    await deleteGoal(page, name)
    await expect(strays).toHaveCount(before - 1)
  }
  await expect(strays).toHaveCount(0)
})

test("goals can be reordered from the keyboard, and it persists", async ({
  page,
}) => {
  await page.goto("/activity")
  for (const name of NAMES) await addGoal(page, name)

  const before = await order(page)
  expect(before).toHaveLength(3)

  // Space lifts, arrow moves, space drops. The waits are load-bearing — dnd-kit needs a
  // tick between the lift and the move (see todos-reorder.spec.ts).
  await page.getByRole("button", { name: `Reorder ${before[0]}` }).focus()
  await page.keyboard.press("Space")
  await page.waitForTimeout(200)
  await page.keyboard.press("ArrowDown")
  await page.waitForTimeout(200)
  await page.keyboard.press("Space")

  await expect
    .poll(async () => (await order(page)).join("|"))
    .not.toBe(before.join("|"))
  const after = await order(page)

  // Reload INSIDE the poll. The assertion above is satisfied the moment the optimistic
  // order renders, which is before the server action has resolved — a single reload here
  // raced the write and read back the old order. Polling asserts what is actually being
  // claimed: the server eventually holds this order, not the local override.
  await expect
    .poll(async () => {
      await page.reload()
      return (await order(page)).join("|")
    })
    .toBe(after.join("|"))
})

test("a milestone can carry a due date, and shows it", async ({ page }) => {
  const title = `E2E gorder alpha ${STAMP}`
  await page.goto("/activity")
  await addGoal(page, title)

  // Milestones moved into the detail dialog in T10 — the rail card is a summary, and a
  // 280px column has no room for an add-a-milestone form.
  await goalCard(page, title)
    .getByRole("button", { name: `Open ${title}` })
    .click()
  const detail = page.getByRole("dialog")
  await detail.getByPlaceholder("Add a milestone").fill("draft the outline")
  await detail.getByLabel("Milestone due date").fill("2020-06-15")
  await detail.getByRole("button", { name: "Add", exact: true }).click()

  await expect(detail.getByText("draft the outline")).toBeVisible()
  await expect(detail).toContainText("Jun 15, 2020")

  // A past date on an outstanding milestone reads as overdue; ticking it off retires that,
  // because a milestone finished late is just finished.
  await expect(detail.getByText("Jun 15, 2020")).toHaveClass(/text-destructive/)
  await detail.getByRole("checkbox").first().click()
  await expect(detail.getByText("Jun 15, 2020")).not.toHaveClass(
    /text-destructive/,
  )

  // Persisted, not just rendered from the form.
  await page.reload()
  await goalCard(page, title)
    .getByRole("button", { name: `Open ${title}` })
    .click()
  await expect(page.getByRole("dialog")).toContainText("Jun 15, 2020")
})
