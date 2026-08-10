import { test, expect } from "./_test"

import { visibleCard } from "./_card"

// Browser coverage for T5a-S8: a task's checklist.
//
// The first test covers a trap this feature walked into during development: the
// add-a-subtask input lives INSIDE the checklist, and the checklist starts collapsed when
// a task has none — so there was no way to add the first one. The menu entry is the fix,
// and starting from a task with an empty checklist is what proves it.

test.afterEach(async ({ page }) => {
  await page.goto("/activity")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const strays = visibleCard(page, "E2E subtask ")
  for (let i = 0; i < 10; i++) {
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

test("a checklist can be started, ticked off, and counted", async ({
  page,
}) => {
  const title = `E2E subtask ${Date.now()}`
  const row = () => visibleCard(page, title)

  await page.goto("/activity")
  const input = page.getByLabel("Quick add task")
  await input.fill(title)
  await input.press("Enter")
  await expect(row()).toHaveCount(1)

  // A brand-new task has no checklist and no chevron — the menu is the only way in.
  await expect(row().getByLabel("Add a subtask")).toHaveCount(0)
  await row().getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Add a subtask" }).click()

  const add = row().getByLabel("Add a subtask")
  await expect(add).toBeVisible()
  for (const sub of ["draft", "review"]) {
    await add.fill(sub)
    await add.press("Enter")
    await expect(row().getByText(sub, { exact: true })).toBeVisible()
  }

  // The parent badges the progress without needing the list open.
  await expect(row()).toContainText("0/2")

  await row().getByRole("checkbox", { name: "Mark draft as done" }).click()
  await expect(row()).toContainText("1/2")
  await expect(row().getByText("draft", { exact: true })).toHaveClass(
    /line-through/,
  )

  // It's really persisted, not just local state.
  await page.reload()
  await expect(row()).toContainText("1/2")

  // Collapsing hides the list but keeps the count visible.
  await row()
    .getByRole("button", { name: `Hide subtasks of ${title}` })
    .click()
  await expect(row().getByText("draft", { exact: true })).toHaveCount(0)
  await expect(row()).toContainText("1/2")

  // Deleting one updates the count.
  await row()
    .getByRole("button", { name: `Show subtasks of ${title}` })
    .click()
  await row().getByRole("button", { name: "Delete draft" }).click()
  await expect(row()).toContainText("0/1")
})

test("deleting a task takes its checklist with it", async ({ page }) => {
  const title = `E2E subtask cascade ${Date.now()}`
  const row = () => visibleCard(page, title)

  await page.goto("/activity")
  const input = page.getByLabel("Quick add task")
  await input.fill(title)
  await input.press("Enter")
  await expect(row()).toHaveCount(1)

  await row().getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Add a subtask" }).click()
  const add = row().getByLabel("Add a subtask")
  await add.fill("orphan-check")
  await add.press("Enter")
  await expect(row()).toContainText("0/1")

  await row().getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row()).toHaveCount(0)

  // The subtask cascaded rather than being left pointing at a deleted task — it would
  // otherwise still be in the export and the clear-all count.
  await page.reload()
  await expect(page.getByText("orphan-check")).toHaveCount(0)
})
