import { test, expect, type Page } from "./_test"

import { visibleCard } from "./_card"

/**
 * Browser coverage for goal momentum: the reading that says whether a goal is still being
 * WORKED, as distinct from how far along it is.
 *
 * The distinction is the whole feature. `goalProgress` reports milestones-done-over-total,
 * so a goal you abandoned last month and one you touched this morning look identical. The
 * assertions below are all about that gap: a goal with untouched work reads stalled, and
 * finishing one linked task flips it — with the progress bar unchanged either way.
 *
 * Default window is 14 days (`goalMomentumDays`), which is what the copy asserts.
 */

async function createGoal(page: Page, title: string) {
  await page.goto("/goals")
  await page.getByRole("button", { name: "Add goal" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title").fill(title)
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(visibleCard(page, title)).toBeVisible()
}

async function createLinkedTask(page: Page, title: string, goalTitle: string) {
  await page.goto("/todos")
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title").fill(title)
  await dialog.getByLabel("Goal").click()
  await page.getByRole("option", { name: goalTitle }).click()
  await dialog.getByRole("button", { name: "Create" }).click()
  // The dialog closes only once the action resolved; navigating sooner races the write.
  await expect(dialog).toBeHidden()
}

async function deleteGoal(page: Page, title: string) {
  await page.goto("/goals")
  const card = visibleCard(page, title)
  await card.getByRole("button", { name: "Goal actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await page.getByRole("button", { name: "Delete goal" }).click()
  await expect(visibleCard(page, title)).toHaveCount(0)
}

async function deleteTask(page: Page, title: string) {
  await page.goto("/todos")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const row = visibleCard(page, title)
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(visibleCard(page, title)).toHaveCount(0)
}

test("finishing a linked task moves a stalled goal", async ({ page }) => {
  const stamp = Date.now()
  const goalTitle = `E2E momentum ${stamp}`
  const taskTitle = `E2E momentum task ${stamp}`

  await createGoal(page, goalTitle)
  await createLinkedTask(page, taskTitle, goalTitle)

  await page.goto("/goals")
  const card = visibleCard(page, goalTitle)

  // A brand-new goal with one open task has something to track and nothing finished.
  await expect(
    card.getByText(/Nothing finished in the last 14 days/),
  ).toBeVisible()
  await expect(card.getByText("1 open of 1")).toBeVisible()

  // Tick it from the goal card itself — the next-action affordance. Completing it here
  // rather than on /todos is the point: a card that reports a stall should also be where
  // you can do something about it.
  await card.getByRole("checkbox", { name: `Complete ${taskTitle}` }).click()

  await expect(card.getByText(/1 finished in the last 14 days/)).toBeVisible()
  await expect(card.getByText("all done")).toBeVisible()

  // The work also lands in the week's review, in the Goals card rather than only in Tasks.
  await page.goto("/review")
  await expect(page.getByText(`${taskTitle} · ${goalTitle}`)).toBeVisible()

  await deleteGoal(page, goalTitle)
  await deleteTask(page, taskTitle)
})

test("a goal with nothing to track gets no momentum reading at all", async ({
  page,
}) => {
  // No milestones, no linked tasks, no numeric target. `currentValue` is overwritten in
  // place with no history, so there is genuinely nothing to measure — and a stalled badge
  // here would be a lie about a goal that might have been updated an hour ago.
  const goalTitle = `E2E untracked ${Date.now()}`
  await createGoal(page, goalTitle)

  const card = visibleCard(page, goalTitle)
  await expect(card.getByText("No milestones or target yet.")).toBeVisible()
  await expect(card.getByText(/finished in the last/)).toHaveCount(0)

  await deleteGoal(page, goalTitle)
})

test("the momentum window follows the setting", async ({ page }) => {
  const goalTitle = `E2E window ${Date.now()}`
  const taskTitle = `E2E window task ${Date.now()}`
  await createGoal(page, goalTitle)
  await createLinkedTask(page, taskTitle, goalTitle)

  await page.goto("/settings")
  await page.getByRole("button", { name: "1 week" }).click()
  await page.getByRole("button", { name: "Save preferences" }).click()
  await expect(page.getByText("Preferences saved")).toBeVisible()

  await page.goto("/goals")
  await expect(
    visibleCard(page, goalTitle).getByText(/in the last week/),
  ).toBeVisible()

  // Put it back — the suite runs serially against a persistent database, so a changed
  // setting would silently retune every later assertion about the copy.
  await page.goto("/settings")
  await page.getByRole("button", { name: "2 weeks" }).click()
  await page.getByRole("button", { name: "Save preferences" }).click()
  await expect(page.getByText("Preferences saved")).toBeVisible()

  await deleteGoal(page, goalTitle)
  await deleteTask(page, taskTitle)
})
