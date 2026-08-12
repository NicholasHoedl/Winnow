import { test, expect, type Page } from "./_test"
import { visibleCard } from "./_card"
import { deleteGoalsMatching, openGoalDetail } from "./_goals"

// Browser coverage for T7d. The review reads from four modules; these seed two of them
// and check the work lands in the right card, plus that the week boundary actually bounds.

const PREFIX = "E2E review"

/** The review's own cards, located by their heading rather than position. */
function card(page: Page, title: string) {
  return visibleCard(page, title)
}

test.afterEach(async ({ page }) => {
  await page.goto("/activity")
  // "Delete goal", not "Delete" — deleting a goal cascades its milestones, so the confirm
  // names what it takes with it. That, and the dialog it now lives behind, are in _goals.
  await deleteGoalsMatching(page, new RegExp(PREFIX))

  await page.goto("/activity")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const tasks = visibleCard(page, new RegExp(PREFIX))
  for (let i = 0; i < 10; i++) {
    const before = await tasks.count()
    if (before === 0) break
    await tasks.first().getByRole("button", { name: "Task actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(tasks).toHaveCount(before - 1)
  }
  await expect(tasks).toHaveCount(0)
})

test("this week's completed work lands in the right cards", async ({
  page,
}) => {
  const stamp = Date.now()
  const taskTitle = `${PREFIX} task ${stamp}`
  const goalTitle = `${PREFIX} goal ${stamp}`
  const milestoneTitle = `${PREFIX} milestone ${stamp}`

  // --- A completed task.
  await page.goto("/activity")
  const quickAdd = page.getByLabel("Quick add task")
  await quickAdd.fill(taskTitle)
  await quickAdd.press("Enter")
  await visibleCard(page, taskTitle).getByLabel("Mark as done").click()

  // --- A ticked milestone under a goal.
  await page.goto("/activity")
  // Either label — see `_goals.ts`. "Add a goal" is the empty-state button; "Add goal"
  // is the `+` once a goal exists.
  await page.getByRole("button", { name: /^Add (a )?goal$/ }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(goalTitle)
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  // Milestones moved into the goal's detail dialog in T10; the rail card is a summary.
  await openGoalDetail(page, goalTitle)
  const detail = page.getByRole("dialog")
  await detail.getByPlaceholder("Add a milestone").fill(milestoneTitle)
  await detail.getByRole("button", { name: "Add", exact: true }).click()
  await expect(detail.getByText(milestoneTitle)).toBeVisible()
  await detail
    .getByRole("checkbox", { name: `Complete ${milestoneTitle}` })
    .click()
  await page.keyboard.press("Escape")

  // --- Both surface in the review, each in its own card.
  await page.goto("/review")
  await expect(card(page, "Tasks")).toContainText(taskTitle)
  await expect(card(page, "Goals")).toContainText(milestoneTitle)
  await expect(card(page, "Goals")).toContainText(goalTitle)

  // Budgets are per calendar month, so the money card offers the month rather than
  // inventing a weekly budget to compare a week against.
  await expect(card(page, "Money")).toContainText("vs budget")
})

test("stepping back a week leaves this week's work behind", async ({
  page,
}) => {
  const taskTitle = `${PREFIX} task ${Date.now()}`

  await page.goto("/activity")
  const quickAdd = page.getByLabel("Quick add task")
  await quickAdd.fill(taskTitle)
  await quickAdd.press("Enter")
  await visibleCard(page, taskTitle).getByLabel("Mark as done").click()

  await page.goto("/review")
  await expect(card(page, "Tasks")).toContainText(taskTitle)

  // The previous week is a link, not client state — which is what makes it reloadable.
  await page.getByRole("link", { name: "Previous week" }).click()
  await expect(page).toHaveURL(/\/review\?week=/)
  await expect(card(page, "Tasks")).not.toContainText(taskTitle)
  // And the way back is offered only once you've left the current week.
  await expect(page.getByRole("link", { name: "This week" })).toBeVisible()

  await page.getByRole("link", { name: "This week" }).click()
  await expect(card(page, "Tasks")).toContainText(taskTitle)
})
