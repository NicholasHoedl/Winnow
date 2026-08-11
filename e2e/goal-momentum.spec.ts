import { test, expect, type Page } from "./_test"

import { goalCard, visibleCard } from "./_card"

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
 *
 * T10 split where that reading is shown. The rail says only "Stalled", because a 280px
 * column cannot spare a sentence for every goal that is fine; the sentence with the window
 * in it lives in the detail dialog, which is where you go when the badge makes you ask why.
 */

async function createGoal(page: Page, title: string) {
  await page.goto("/activity")
  await page.getByRole("button", { name: "Add goal" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title").fill(title)
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(goalCard(page, title)).toBeVisible()
}

async function createLinkedTask(page: Page, title: string, goalTitle: string) {
  await page.goto("/activity")
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title").fill(title)
  await dialog.getByLabel("Goal").click()
  await page.getByRole("option", { name: goalTitle }).click()
  await dialog.getByRole("button", { name: "Create" }).click()
  // The dialog closes only once the action resolved; navigating sooner races the write.
  await expect(dialog).toBeHidden()
}

async function openDetail(page: Page, title: string) {
  await goalCard(page, title)
    .getByRole("button", { name: `Open ${title}` })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
}

async function deleteGoal(page: Page, title: string) {
  await page.goto("/activity")
  await openDetail(page, title)
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await page.getByRole("button", { name: "Delete goal" }).click()
  await expect(goalCard(page, title)).toHaveCount(0)
}

async function deleteTask(page: Page, title: string) {
  await page.goto("/activity")
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

  await page.goto("/activity")
  const card = goalCard(page, goalTitle)

  // A brand-new goal with one open task has something to track and nothing finished.
  await expect(card.getByText("Stalled")).toBeVisible()
  await expect(card.getByText("1 open")).toBeVisible()

  // The window and the count are in the detail, not the rail.
  await openDetail(page, goalTitle)
  await expect(
    page.getByRole("dialog").getByText(/Nothing finished in the last 14 days/),
  ).toBeVisible()
  await page.keyboard.press("Escape")

  // Tick it off in the task list beside the rail. Before T10 this was a special
  // "next action" checkbox inside the goal card, because the goals page had no task list
  // of its own — the merge makes that compromise unnecessary: select the goal and its work
  // IS the list.
  await card
    .getByRole("button", { name: `Show tasks for ${goalTitle}` })
    .click()
  await visibleCard(page, taskTitle).getByLabel("Mark as done").click()
  await page.reload()

  await expect(card.getByLabel(`${goalTitle} is moving`)).toBeVisible()
  await expect(card.getByText("No open tasks")).toBeVisible()
  await openDetail(page, goalTitle)
  await expect(
    page.getByRole("dialog").getByText(/1 finished in the last 14 days/),
  ).toBeVisible()
  await page.keyboard.press("Escape")

  // The work also lands in the week's review, in the Goals card rather than only in Tasks.
  await page.goto("/review")
  await expect(page.getByText(`${taskTitle} · ${goalTitle}`)).toBeVisible()

  await deleteGoal(page, goalTitle)
  await deleteTask(page, taskTitle)
})

/**
 * T12b. The defect the whole T12 line exists to fix.
 *
 * A habit creates no tasks and ticks no milestones, so before this a goal worked entirely
 * through one had nothing momentum could see: it returned null and the card said nothing, or
 * — once the goal had any other stale work — it read Stalled while being worked hard.
 */
test("a goal worked through a habit reads as moving, not stalled", async ({
  page,
}) => {
  const stamp = Date.now()
  const goalTitle = `E2E momentum habit ${stamp}`
  const habitTitle = `E2E momentum practice ${stamp}`

  await createGoal(page, goalTitle)

  await page.goto("/activity/habits")
  await page.getByRole("button", { name: "New habit", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(habitTitle)
  await dialog.getByLabel("Goal", { exact: true }).click()
  await page.getByRole("option", { name: goalTitle, exact: true }).click()
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(visibleCard(page, habitTitle)).toHaveCount(1)

  // Attached but never logged. "Stalled" is the honest reading here — the goal is now
  // measurable, and nothing has been done. Before T12b it was not measurable at all.
  await page.goto("/activity")
  const card = goalCard(page, goalTitle)
  await expect(card.getByText("Stalled")).toBeVisible()

  // One session flips it, logged from the rail rather than through a task.
  await page
    .getByTestId("rail-habit")
    .filter({ hasText: habitTitle })
    .getByRole("button", { name: `Log ${habitTitle}` })
    .click()
  await expect(card.getByLabel(`${goalTitle} is moving`)).toBeVisible()

  // And the detail counts it the same way it counts a finished task.
  await openDetail(page, goalTitle)
  await expect(
    page.getByRole("dialog").getByText(/1 finished in the last 14 days/),
  ).toBeVisible()
  await page.keyboard.press("Escape")

  // The habit goes first: it holds the goal link, and deleting the goal would only null it.
  await page.goto("/activity/habits")
  await visibleCard(page, habitTitle)
    .getByRole("button", { name: `${habitTitle} actions` })
    .click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await page.getByRole("button", { name: "Delete habit", exact: true }).click()
  await expect(visibleCard(page, habitTitle)).toHaveCount(0)
  await deleteGoal(page, goalTitle)
})

test("a goal with nothing to track gets no momentum reading at all", async ({
  page,
}) => {
  // No milestones, no linked tasks, no numeric target. `currentValue` is overwritten in
  // place with no history, so there is genuinely nothing to measure — and a stalled badge
  // here would be a lie about a goal that might have been updated an hour ago.
  const goalTitle = `E2E untracked ${Date.now()}`
  await createGoal(page, goalTitle)

  await expect(goalCard(page, goalTitle).getByText("Stalled")).toHaveCount(0)
  await openDetail(page, goalTitle)
  const detail = page.getByRole("dialog")
  await expect(detail.getByText("No milestones or target yet.")).toBeVisible()
  await expect(detail.getByText(/finished in the last/)).toHaveCount(0)
  await page.keyboard.press("Escape")

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

  await page.goto("/activity")
  await openDetail(page, goalTitle)
  await expect(
    page.getByRole("dialog").getByText(/in the last week/),
  ).toBeVisible()
  await page.keyboard.press("Escape")

  // Put it back — the suite runs serially against a persistent database, so a changed
  // setting would silently retune every later assertion about the copy.
  await page.goto("/settings")
  await page.getByRole("button", { name: "2 weeks" }).click()
  await page.getByRole("button", { name: "Save preferences" }).click()
  await expect(page.getByText("Preferences saved")).toBeVisible()

  await deleteGoal(page, goalTitle)
  await deleteTask(page, taskTitle)
})
