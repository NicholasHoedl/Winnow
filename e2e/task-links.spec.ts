import { test, expect } from "@playwright/test"

// Browser coverage for T2-S2: linking a task to a goal from the task dialog, seeing it
// on the goal card, and confirming a goal delete DETACHES its tasks instead of removing
// them (the ON DELETE set null FK from S1).

test("link a task to a goal, then detach it by deleting the goal", async ({
  page,
}) => {
  const stamp = Date.now()
  const goalTitle = `E2E goal ${stamp}`
  const taskTitle = `E2E linked task ${stamp}`

  // A goal to link to.
  await page.goto("/goals")
  await page.getByRole("button", { name: "Add goal" }).click()
  const goalDialog = page.getByRole("dialog")
  await goalDialog.getByLabel("Title").fill(goalTitle)
  await goalDialog.getByRole("button", { name: "Add", exact: true }).click()

  const card = page.locator("div.bg-card").filter({ hasText: goalTitle })
  await expect(card).toBeVisible()

  // A task pointing at it.
  await page.goto("/todos")
  await page.getByRole("button", { name: "New task" }).click()
  const taskDialog = page.getByRole("dialog")
  await taskDialog.getByLabel("Title").fill(taskTitle)
  await taskDialog.getByLabel("Goal").click()
  await page.getByRole("option", { name: goalTitle }).click()
  await taskDialog.getByRole("button", { name: "Create" }).click()
  // The dialog only closes once the action resolved — navigating before that races
  // the write (and its revalidation) against the next render.
  await expect(taskDialog).toBeHidden()

  // The goal card surfaces it.
  await page.goto("/goals")
  await expect(card.getByText(taskTitle)).toBeVisible()

  // Deleting the goal detaches the task rather than deleting it.
  await card.getByRole("button", { name: "Goal actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await page.getByRole("button", { name: "Delete goal" }).click()
  await expect(
    page.locator("div.bg-card").filter({ hasText: goalTitle }),
  ).toHaveCount(0)

  await page.goto("/todos")
  const row = page.locator("div.bg-card").filter({ hasText: taskTitle })
  await expect(row).toBeVisible()

  // Cleanup.
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(
    page.locator("div.bg-card").filter({ hasText: taskTitle }),
  ).toHaveCount(0)
})

test("the link pickers are hidden for a repeating task", async ({ page }) => {
  await page.goto("/todos")
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByLabel("Goal")).toBeVisible()
  await expect(dialog.getByLabel("Event")).toBeVisible()

  // Turning on a repeat makes this a rule — links belong to concrete task rows only.
  await dialog.getByRole("combobox").filter({ hasText: "Off" }).click()
  await page.getByRole("option", { name: "Daily" }).click()
  await expect(dialog.getByLabel("Goal")).toHaveCount(0)
  await expect(dialog.getByLabel("Event")).toHaveCount(0)
})
