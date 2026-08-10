import { test, expect, type Page } from "./_test"

import { goalCard, visibleCard } from "./_card"
import { addGoal, deleteGoalsMatching } from "./_goals"

/**
 * Browser coverage for T10: the merged Activity page (ADR-0013).
 *
 * What this covers that the reshaped goal specs don't: the page's own behaviour — the rail
 * as a filter, the URL as the place that selection lives, and the mobile presentation,
 * which is a different component rendering the same state and is therefore the half most
 * likely to drift.
 *
 * The redirects from `/todos` and `/goals` are in navigation.spec.ts, with the rest of the
 * routing.
 */

const STAMP = Date.now()
const GOAL_A = `E2E act alpha ${STAMP}`
const GOAL_B = `E2E act bravo ${STAMP}`
const TASK_A = `E2E act task alpha ${STAMP}`
const TASK_B = `E2E act task bravo ${STAMP}`

async function createLinkedTask(page: Page, title: string, goalTitle: string) {
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(title)
  await dialog.getByLabel("Goal").click()
  await page.getByRole("option", { name: goalTitle }).click()
  await dialog.getByRole("button", { name: "Create" }).click()
  await expect(dialog).toBeHidden()
}

test.afterEach(async ({ page }) => {
  await page.goto("/activity")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const tasks = visibleCard(page, "E2E act task ")
  for (let i = 0; i < 10; i++) {
    const before = await tasks.count()
    if (before === 0) break
    await tasks.first().getByRole("button", { name: "Task actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(tasks).toHaveCount(before - 1)
    await page.reload()
    await page.getByRole("button", { name: "All", exact: true }).click()
  }
  await page.goto("/activity")
  await deleteGoalsMatching(page, "E2E act ")
})

test("the rail scopes the list to one goal, and the URL remembers which", async ({
  page,
}) => {
  await page.goto("/activity")
  await addGoal(page, { title: GOAL_A })
  await addGoal(page, { title: GOAL_B })
  await createLinkedTask(page, TASK_A, GOAL_A)
  await createLinkedTask(page, TASK_B, GOAL_B)

  await page.goto("/activity")
  await expect(visibleCard(page, TASK_A)).toHaveCount(1)
  await expect(visibleCard(page, TASK_B)).toHaveCount(1)

  // Selecting A hides B's work — the filter excludes, which is the part it can get wrong.
  await goalCard(page, GOAL_A)
    .getByRole("button", { name: `Show tasks for ${GOAL_A}` })
    .click()
  await expect(visibleCard(page, TASK_A)).toHaveCount(1)
  await expect(visibleCard(page, TASK_B)).toHaveCount(0)

  // Switching straight from one goal to another, without clearing first.
  await goalCard(page, GOAL_B)
    .getByRole("button", { name: `Show tasks for ${GOAL_B}` })
    .click()
  await expect(visibleCard(page, TASK_A)).toHaveCount(0)
  await expect(visibleCard(page, TASK_B)).toHaveCount(1)

  // The selection is a query param, so it is linkable and survives a reload. It is written
  // with history.replaceState rather than a router navigation — no refetch on a filter
  // click — which is exactly the thing a reload proves actually landed in the URL.
  await expect(page).toHaveURL(/\/activity\?goal=/)
  await page.reload()
  await expect(visibleCard(page, TASK_B)).toHaveCount(1)
  await expect(visibleCard(page, TASK_A)).toHaveCount(0)

  await page.getByRole("button", { name: `Clear the ${GOAL_B} filter` }).click()
  await expect(visibleCard(page, TASK_A)).toHaveCount(1)
  await expect(page).toHaveURL(/\/activity$/)
})

test("a deep link to a goal that no longer exists falls back to everything", async ({
  page,
}) => {
  // A goal search result links straight to `?goal=<id>`, and that link outlives the goal.
  // Resolving the id against the goals actually present means a dangling one degrades to
  // "all activity" rather than rendering an empty list with nothing to explain it.
  await page.goto("/activity")
  await addGoal(page, { title: GOAL_A })
  await createLinkedTask(page, TASK_A, GOAL_A)

  await page.goto("/activity?goal=00000000-0000-4000-8000-000000000000")
  await expect(visibleCard(page, TASK_A)).toHaveCount(1)
  // And it does not claim to be filtered by something that isn't there.
  await expect(page.getByRole("button", { name: /^Clear the / })).toHaveCount(0)
})

test("on a phone the rail becomes a chip scroller that still filters", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/activity")
  await addGoal(page, { title: GOAL_A })
  await addGoal(page, { title: GOAL_B })
  await createLinkedTask(page, TASK_A, GOAL_A)
  await createLinkedTask(page, TASK_B, GOAL_B)

  await page.goto("/activity")

  // The desktop rail is not rendered at this width; the chips are.
  await expect(goalCard(page, GOAL_A)).toHaveCount(0)
  const chip = page.getByTestId("goal-chip").filter({ hasText: GOAL_A })
  await expect(chip).toHaveCount(1)

  await chip.getByRole("button", { name: `Show tasks for ${GOAL_A}` }).click()
  await expect(visibleCard(page, TASK_A)).toHaveCount(1)
  await expect(visibleCard(page, TASK_B)).toHaveCount(0)

  // The page must never scroll sideways — the overflow belongs to the chip strip alone.
  // Asserted against documentElement, because that is what actually shows a bottom
  // scrollbar when a too-wide child escapes its container.
  const overflows = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})
