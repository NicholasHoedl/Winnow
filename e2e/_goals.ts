import { expect, type Page } from "@playwright/test"

import { goalCard } from "./_card"

/**
 * Creating, opening and deleting a goal on `/goals`.
 *
 * Shared because T10 moved all three, and T13 moved them again — which is the point. Six
 * specs were carrying six copies of "open the dropdown, click Delete, confirm"; one copy
 * meant the move from the rail to a page cost one edit here instead of six there.
 *
 * None of these navigate — callers are already on `/goals`, and hiding a `goto` inside a
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
  // One label at last. The rail had two affordances that changed with the account's state
  // — "Add a goal" at zero, a `+` icon labelled "Add goal" thereafter — and matching only
  // the second meant this helper silently required a goal to already exist, which is
  // exactly what broke when T12g gave the suite an empty database. `/goals` has one header
  // button at every state.
  await page.getByRole("button", { name: "New goal" }).click()
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
  // `goalCard` at every width now. It used to be `goalEntry`, which matched the rail card
  // OR the mobile chip, because the rail was `lg:` only and a goal had two presentations.
  // `/goals` renders one card at every width, so the two-presentation problem is gone.
  await expect(goalCard(page, fields.title)).toHaveCount(1)
}

/** Open one goal's detail dialog — milestones, progress wording, edit and delete. */
export async function openGoalDetail(page: Page, title: string) {
  await goalCard(page, title)
    .getByRole("button", { name: `Open ${title}` })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
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
  /**
   * Prove we are somewhere goal cards can exist, BEFORE concluding there are none.
   *
   * Without this the helper is silently vacuous on the wrong page: `goalCard` matches
   * nothing, the loop breaks on its first iteration, and `toHaveCount(0)` passes because
   * zero really is what is there. A cleanup that deletes nothing and reports success is
   * worse than one that throws — it leaks a row into every spec that runs after it.
   *
   * That is not hypothetical. T13 moved goal cards from `/activity` to `/goals`;
   * `review.spec.ts` kept cleaning up on `/activity`, leaked a goal for a whole run, and
   * the only thing that noticed was a 4px layout overflow on `/companion` — whose goal
   * picker defaults to the oldest surviving goal.
   */
  await expect(page.getByRole("button", { name: "New goal" })).toBeVisible()

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
