import { expect, type Page } from "@playwright/test"

import { goalCard, goalEntry } from "./_card"

/**
 * Creating, opening and deleting a goal on `/activity`.
 *
 * Shared because T10 moved all three. A goal used to be a card with its own actions menu;
 * it is now a rail summary whose editing lives behind a chevron, and six specs were
 * carrying six copies of "open the dropdown, click Delete, confirm". One copy, so the next
 * move costs one edit.
 *
 * None of these navigate — callers are already on `/activity`, and hiding a `goto` inside a
 * helper is how a spec ends up asserting against a page it did not mean to be on.
 */

/** Create a goal through the dialog; every field is optional except the title. */
export async function addGoal(
  page: Page,
  fields: {
    title: string
    current?: string
    target?: string
    unit?: string
    targetDate?: string
  },
) {
  await page.getByRole("button", { name: "Add goal" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(fields.title)
  if (fields.current) await dialog.getByLabel("Current").fill(fields.current)
  if (fields.target)
    await dialog.getByLabel("Target", { exact: true }).fill(fields.target)
  if (fields.unit) await dialog.getByLabel("Unit").fill(fields.unit)
  if (fields.targetDate) {
    await dialog.getByLabel("Target date (optional)").fill(fields.targetDate)
  }
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  // `goalEntry`, not `goalCard`: this helper is called at phone widths too.
  await expect(goalEntry(page, fields.title)).toHaveCount(1)
}

/** Open one goal's detail dialog — milestones, progress wording, edit and delete. */
export async function openGoalDetail(page: Page, title: string) {
  await goalCard(page, title)
    .getByRole("button", { name: `Open ${title}` })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
}

export async function closeGoalDetail(page: Page) {
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
}

/** Delete a goal by title, through its detail dialog and the confirm. */
export async function deleteGoal(page: Page, title: string) {
  await openGoalDetail(page, title)
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await page.getByRole("button", { name: "Delete goal" }).click()
  await expect(goalCard(page, title)).toHaveCount(0)
}

/**
 * Delete every goal whose title contains `fragment`, for `afterEach` cleanup.
 *
 * Counts BEFORE each delete: reading the count afterwards asserts `n === n - 1` against a
 * list that has already shrunk, which is unsatisfiable — the same trap that hung
 * `deleteTasksMatching` in companion.spec.ts.
 */
export async function deleteGoalsMatching(
  page: Page,
  fragment: string | RegExp,
) {
  const strays = goalCard(page, fragment)
  for (let i = 0; i < 10; i++) {
    const before = await strays.count()
    if (before === 0) break
    const title = (await strays.first().innerText()).split("\n")[0]
    await openGoalDetail(page, title)
    await page.getByRole("button", { name: "Delete", exact: true }).click()
    await page.getByRole("button", { name: "Delete goal" }).click()
    await expect(strays).toHaveCount(before - 1)
  }
  await expect(strays).toHaveCount(0)
}
