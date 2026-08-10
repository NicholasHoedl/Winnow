import { test, expect } from "./_test"

import { goalCard, visibleCard } from "./_card"

// Browser coverage for a goal's relationship to its tasks (T2, T5a-S11, reshaped by T10).
//
// Until T10 this was a read-only list inside the goal card, with exactly one actionable
// row — a compromise, because telling you a goal had stalled and then sending you to
// another page to act was the shape of advice nobody takes. On /activity the compromise is
// gone: selecting the goal scopes the real task list to it, every row checkable.
//
// So what this asserts changed shape too, and got stronger. The old spec could only check
// that the right tasks were LISTED; this one checks that unrelated tasks are EXCLUDED,
// which is the part a filter can actually get wrong.

const STAMP = Date.now()
const GOAL = `E2E link goal ${STAMP}`
const LATE = `E2E link late ${STAMP}`
const OPEN = `E2E link open ${STAMP}`
const OTHER = `E2E link unrelated ${STAMP}`

const rail = (page: import("@playwright/test").Page) => goalCard(page, GOAL)

test.afterEach(async ({ page }) => {
  // Tasks first: deleting the goal only detaches them (goal_id ON DELETE SET NULL).
  await page.goto("/activity")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const tasks = visibleCard(page, `E2E link `)
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

  await page.goto("/activity")
  const goals = goalCard(page, "E2E link goal ")
  for (let i = 0; i < 5; i++) {
    const before = await goals.count()
    if (before === 0) break
    await goals
      .first()
      .getByRole("button", { name: /^Open / })
      .click()
    await page.getByRole("button", { name: "Delete", exact: true }).click()
    await page.getByRole("button", { name: "Delete goal" }).click()
    await expect(goals).toHaveCount(before - 1)
  }
  await expect(goals).toHaveCount(0)
})

/**
 * Tick a task off and wait for the write to actually land.
 *
 * The reload is the load-bearing part. `toggleTaskStatus` runs inside a transition and
 * `useOptimistic` drops the row the instant it is clicked, so asserting immediately races
 * the Server Action — and the rail's count is rendered from the database, not from the
 * optimistic state. This spec lost that race intermittently and read "1 open" for a task it
 * had already ticked.
 */
async function complete(page: import("@playwright/test").Page, title: string) {
  await page.goto("/activity")
  const row = visibleCard(page, title)
  await row.getByLabel("Mark as done").click()
  await expect(row).toHaveCount(0) // optimistic — proves only that the click took
  await page.reload()
  await expect(row).toHaveCount(0) // and now it has actually been written
}

test("selecting a goal scopes the task list to its work", async ({ page }) => {
  // --- A goal to link against.
  await page.goto("/activity")
  await page.getByRole("button", { name: "Add goal" }).click()
  const goalDialog = page.getByRole("dialog")
  await goalDialog.getByLabel("Title", { exact: true }).fill(GOAL)
  await goalDialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(rail(page)).toHaveCount(1)

  // --- Two tasks pointing at it, one overdue; and one that points at nothing, which is
  // what proves the filter excludes rather than merely orders.
  for (const [title, due, link] of [
    [LATE, "2020-02-01", true],
    [OPEN, "", true],
    [OTHER, "", false],
  ] as const) {
    await page.getByRole("button", { name: "New task" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Title", { exact: true }).fill(title)
    if (due) await dialog.getByLabel("Due date").fill(due)
    if (link) {
      await dialog.getByLabel("Goal").click()
      await page.getByRole("option", { name: GOAL }).click()
    }
    await dialog.getByRole("button", { name: "Create" }).click()
    await expect(visibleCard(page, title)).toHaveCount(1)
  }

  await page.goto("/activity")
  await expect(rail(page)).toContainText("2 open")

  // --- Unfiltered, all three are on the board.
  await expect(visibleCard(page, OTHER)).toHaveCount(1)

  // --- Filtered, the unrelated one is gone and the overdue one still reads as overdue.
  await rail(page)
    .getByRole("button", { name: `Show tasks for ${GOAL}` })
    .click()
  await expect(visibleCard(page, LATE)).toHaveCount(1)
  await expect(visibleCard(page, OPEN)).toHaveCount(1)
  await expect(visibleCard(page, OTHER)).toHaveCount(0)
  await expect(page.getByText("Overdue").first()).toBeVisible()

  // --- The selection is in the URL, so it survives a reload and can be linked to. This is
  // what the goal search result now points at.
  await expect(page).toHaveURL(/\/activity\?goal=/)
  await page.reload()
  await expect(visibleCard(page, OTHER)).toHaveCount(0)
  await expect(visibleCard(page, LATE)).toHaveCount(1)

  // --- Clearing it brings everything back. The control names the goal it will drop, so a
  // short list is never ambiguous between "you're done" and "you're filtered".
  await page.getByRole("button", { name: `Clear the ${GOAL} filter` }).click()
  await expect(visibleCard(page, OTHER)).toHaveCount(1)

  // --- Completing the LATE one is the case that matters: the count drops AND the overdue
  // flag goes with it, because a task you finished is not late.
  await complete(page, LATE)
  await page.goto("/activity")
  await expect(rail(page)).toContainText("1 open")

  // --- Finishing the rest reads as done rather than "0 open".
  await complete(page, OPEN)
  await page.goto("/activity")
  await expect(rail(page)).toContainText("No open tasks")
})
