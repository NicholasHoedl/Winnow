import { test, expect } from "./_test"

import { goalCard, visibleCard } from "./_card"
import { addGoal, deleteGoal } from "./_goals"

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
  await page.goto("/activity")
  await page.getByRole("button", { name: "Add goal" }).click()
  const goalDialog = page.getByRole("dialog")
  await goalDialog.getByLabel("Title").fill(goalTitle)
  await goalDialog.getByRole("button", { name: "Add", exact: true }).click()

  const card = goalCard(page, goalTitle)
  await expect(card).toBeVisible()

  // A task pointing at it.
  await page.goto("/activity")
  await page.getByRole("button", { name: "New task" }).click()
  const taskDialog = page.getByRole("dialog")
  await taskDialog.getByLabel("Title").fill(taskTitle)
  await taskDialog.getByLabel("Goal").click()
  await page.getByRole("option", { name: goalTitle }).click()
  await taskDialog.getByRole("button", { name: "Create" }).click()
  // The dialog only closes once the action resolved — navigating before that races
  // the write (and its revalidation) against the next render.
  await expect(taskDialog).toBeHidden()

  // Selecting the goal scopes the list to it — which is how a goal surfaces its work since
  // T10, in place of the read-only list that used to sit inside the card.
  await page.goto("/activity")
  await card
    .getByRole("button", { name: `Show tasks for ${goalTitle}` })
    .click()
  await expect(visibleCard(page, taskTitle)).toBeVisible()

  // Deleting the goal detaches the task rather than deleting it.
  await deleteGoal(page, goalTitle)

  await page.goto("/activity")
  const row = visibleCard(page, taskTitle)
  await expect(row).toBeVisible()

  // Cleanup.
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(visibleCard(page, taskTitle)).toHaveCount(0)
})

/**
 * Both pickers are rendered only when there is something to pick — `task-dialog.tsx` hides
 * the Goal select when the account has no goals and the Event select when it has no events.
 * So this test seeds one of each first: without them it fails on the *positive* assertion,
 * which reads as "the picker is broken" when the truth is "there is nothing to link to".
 * That is exactly how it went red once, on an account with no events.
 */
test("the link pickers are hidden for a repeating task", async ({ page }) => {
  const stamp = Date.now()
  const goalTitle = `E2E link goal ${stamp}`
  const eventTitle = `E2E link event ${stamp}`

  await page.goto("/activity")
  await addGoal(page, { title: goalTitle })

  // Defaults are today at 09:00, which is all this needs — the picker only lists series.
  // The DAY view, not the month grid: the grid caps chips per day behind a "+N more", so
  // an event created on a busy today is real, invisible, and unclickable for cleanup.
  await page.goto("/calendar?view=day")
  await page.getByRole("button", { name: "Add event" }).click()
  await page.getByLabel("Title").fill(eventTitle)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(
    page.getByRole("button").filter({ hasText: eventTitle }).first(),
  ).toBeVisible()

  await page.goto("/activity")
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByLabel("Goal")).toBeVisible()
  await expect(dialog.getByLabel("Event")).toBeVisible()

  // Turning on a repeat makes this a rule — links belong to concrete task rows only.
  await dialog.getByRole("combobox").filter({ hasText: "Off" }).click()
  await page.getByRole("option", { name: "Daily" }).click()
  await expect(dialog.getByLabel("Goal")).toHaveCount(0)
  await expect(dialog.getByLabel("Event")).toHaveCount(0)

  // Cleanup. The dialog is still open on a half-filled form, so close it first — leaving
  // it up would have the next spec's `getByRole("dialog")` resolve to this one.
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await deleteGoal(page, goalTitle)

  await page.goto("/calendar?view=day")
  await page.getByRole("button").filter({ hasText: eventTitle }).first().click()
  await page.getByRole("button", { name: "Delete" }).click()
  await expect(
    page.getByRole("button").filter({ hasText: eventTitle }),
  ).toHaveCount(0)
})
