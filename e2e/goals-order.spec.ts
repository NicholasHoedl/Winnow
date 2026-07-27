import { test, expect } from "@playwright/test"

// Browser coverage for T5a-S10: milestone due dates, and reordering goals.
//
// The reorder uses the KEYBOARD path rather than a mouse drag: a pointer drag's drop
// target in a wrapping grid depends on viewport width. The mouse path is already covered
// for the single-column task list in todos-reorder.spec.ts.
//
// It asserts that the order CHANGED and survived a reload, rather than predicting the
// resulting permutation. Goals wrap into a two-column grid alongside whatever goals the
// account already has, so which arrow keys are even valid depends on where the card
// happens to sit — ArrowRight does nothing from the right-hand column. Pinning an exact
// expected order would be testing the grid's geometry, not the feature.

const STAMP = Date.now()
const NAMES = ["alpha", "bravo", "charlie"].map(
  (n) => `E2E gorder ${n} ${STAMP}`,
)

const card = (page: import("@playwright/test").Page, title: string) =>
  page.locator("div.bg-card").filter({ hasText: title })

/** The E2E goals, in the order they appear on the page. */
async function order(page: import("@playwright/test").Page) {
  const text = await page.locator("main, body").first().innerText()
  return NAMES.filter((n) => text.includes(n)).sort(
    (a, b) => text.indexOf(a) - text.indexOf(b),
  )
}

test.afterEach(async ({ page }) => {
  await page.goto("/goals")
  const strays = page.locator("div.bg-card").filter({ hasText: "E2E gorder " })
  for (let i = 0; i < 10; i++) {
    const before = await strays.count()
    if (before === 0) break
    await strays.first().getByRole("button", { name: "Goal actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await page.getByRole("button", { name: "Delete goal" }).click()
    await expect(strays).toHaveCount(before - 1)
  }
  await expect(strays).toHaveCount(0)
})

test("goals can be reordered from the keyboard, and it persists", async ({
  page,
}) => {
  await page.goto("/goals")
  for (const name of NAMES) {
    await page.getByRole("button", { name: "Add goal" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Title", { exact: true }).fill(name)
    await dialog.getByRole("button", { name: "Add", exact: true }).click()
    await expect(card(page, name)).toHaveCount(1)
  }

  const before = await order(page)
  expect(before).toHaveLength(3)

  // Space lifts, arrow moves, space drops. The waits are load-bearing — dnd-kit needs a
  // tick between the lift and the move (see todos-reorder.spec.ts). ArrowDown moves by a
  // whole row in a grid, which is valid from any position except the last.
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
  await page.goto("/goals")
  await page.getByRole("button", { name: "Add goal" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(title)
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(card(page, title)).toHaveCount(1)

  const goal = card(page, title)
  await goal.getByPlaceholder("Add a milestone").fill("draft the outline")
  await goal.getByLabel("Milestone due date").fill("2020-06-15")
  await goal.getByRole("button", { name: "Add", exact: true }).click()

  await expect(goal.getByText("draft the outline")).toBeVisible()
  await expect(goal).toContainText("Jun 15, 2020")

  // Persisted, not just rendered from the form.
  await page.reload()
  await expect(card(page, title)).toContainText("Jun 15, 2020")

  // A past date on an outstanding milestone reads as overdue; ticking it off retires
  // that, because a milestone finished late is just finished.
  const dueLabel = card(page, title).getByText("Jun 15, 2020")
  await expect(dueLabel).toHaveClass(/text-destructive/)
  await card(page, title).getByRole("checkbox").first().click()
  await expect(card(page, title).getByText("Jun 15, 2020")).not.toHaveClass(
    /text-destructive/,
  )
})
