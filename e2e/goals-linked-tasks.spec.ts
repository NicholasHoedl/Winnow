import { test, expect } from "@playwright/test"

// Browser coverage for T5a-S11: the linked-tasks block on a goal card.
//
// The block itself predates T5a and stays deliberately read-only — /todos is where you act
// on a task, and a second checkbox here would be two places to keep in step. What it
// lacked was any signal you could read at a glance: how many are outstanding, whether any
// are late, and a way through to them.

const STAMP = Date.now()
const GOAL = `E2E link goal ${STAMP}`
const LATE = `E2E link late ${STAMP}`
const OPEN = `E2E link open ${STAMP}`

const card = (page: import("@playwright/test").Page) =>
  page.locator("div.bg-card").filter({ hasText: GOAL })

test.afterEach(async ({ page }) => {
  // Tasks first: deleting the goal only detaches them (goal_id ON DELETE SET NULL).
  await page.goto("/todos")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const tasks = page.locator("div.bg-card").filter({ hasText: `E2E link ` })
  for (let i = 0; i < 10; i++) {
    const before = await tasks.count()
    if (before === 0) break
    await tasks.first().getByRole("button", { name: "Task actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(tasks).toHaveCount(before - 1)
    await page.reload()
    await page.getByRole("button", { name: "All", exact: true }).click()
  }
  await expect(tasks).toHaveCount(0)

  await page.goto("/goals")
  const goals = page
    .locator("div.bg-card")
    .filter({ hasText: "E2E link goal " })
  for (let i = 0; i < 5; i++) {
    const before = await goals.count()
    if (before === 0) break
    await goals.first().getByRole("button", { name: "Goal actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await page.getByRole("button", { name: "Delete goal" }).click()
    await expect(goals).toHaveCount(before - 1)
  }
  await expect(goals).toHaveCount(0)
})

test("a goal card counts its open linked tasks and flags the late ones", async ({
  page,
}) => {
  // --- A goal to link against.
  await page.goto("/goals")
  await page.getByRole("button", { name: "Add goal" }).click()
  const goalDialog = page.getByRole("dialog")
  await goalDialog.getByLabel("Title", { exact: true }).fill(GOAL)
  await goalDialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(card(page)).toHaveCount(1)

  // --- Two tasks pointing at it: one overdue, one not.
  await page.goto("/todos")
  for (const [title, due] of [
    [LATE, "2020-02-01"],
    [OPEN, ""],
  ] as const) {
    await page.getByRole("button", { name: "New task" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Title", { exact: true }).fill(title)
    if (due) await dialog.getByLabel("Due date").fill(due)
    await dialog.getByLabel("Goal").click()
    await page.getByRole("option", { name: GOAL }).click()
    await dialog.getByRole("button", { name: "Create" }).click()
    await expect(
      page.locator("div.bg-card").filter({ hasText: title }),
    ).toHaveCount(1)
  }

  await page.goto("/goals")
  await expect(card(page)).toContainText("2 open of 2")
  await expect(card(page)).toContainText(LATE)
  await expect(card(page)).toContainText("Overdue")

  // --- Completing the LATE one is the case that matters: the count drops AND the overdue
  // flag goes with it, because a task you finished is not late. Completing the undated
  // task instead would have asserted nothing about that.
  await page.goto("/todos")
  await page
    .locator("div.bg-card")
    .filter({ hasText: LATE })
    .getByLabel("Mark as done")
    .click()

  await page.goto("/goals")
  await expect(card(page)).toContainText("1 open of 2")
  await expect(card(page)).not.toContainText("Overdue")

  // --- Finishing the rest reads as done rather than "0 open of 2".
  await page.goto("/todos")
  await page
    .locator("div.bg-card")
    .filter({ hasText: OPEN })
    .getByLabel("Mark as done")
    .click()
  await page.goto("/goals")
  await expect(card(page)).toContainText("all done")

  // --- The click-through is the point of the block: act on them over there.
  await card(page).getByRole("link", { name: "Open →" }).click()
  await expect(page).toHaveURL(/\/todos$/)
})
