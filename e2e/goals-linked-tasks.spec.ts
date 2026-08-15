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

/**
 * This goal's card, on `/goals`.
 *
 * Named `rail` until T13, when the rail it referred to stopped existing. Worth renaming
 * rather than leaving: every use of it now has to be on `/goals`, and a name that says
 * "rail" invites the reader to assume it is beside the task list — which is exactly the
 * assumption that put three assertions on the wrong page in this file.
 */
const card = (page: import("@playwright/test").Page) => goalCard(page, GOAL)

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

  await page.goto("/goals")
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
  /**
   * Longer than the 30s default because this test genuinely takes longer, not because it
   * is flaky. Proving a filter EXCLUDES needs a goal, three tasks and two completions —
   * roughly ten full page loads and four dialogs — and each completion reloads on purpose,
   * to beat the optimistic update and read what the server actually stored.
   *
   * Measured at 40–50s; it sat just under the default and tipped over under full-suite
   * load, which reads as a regression every time. The assertions are unchanged: this
   * corrects a budget that was wrong for this test, rather than lowering the bar.
   *
   * If it grows again, split it rather than raising this further.
   */
  test.setTimeout(90_000)

  // --- A goal to link against.
  await page.goto("/goals")
  // One button at every state now — see `_goals.ts`. The rail had two ("Add a goal" at
  // zero, a `+` labelled "Add goal" thereafter) and matching one silently required a goal
  // to already exist.
  await page.getByRole("button", { name: "New goal" }).click()
  const goalDialog = page.getByRole("dialog")
  await goalDialog.getByLabel("Title", { exact: true }).fill(GOAL)
  await goalDialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(card(page)).toHaveCount(1)

  // --- Two tasks pointing at it, one overdue; and one that points at nothing, which is
  // what proves the filter excludes rather than merely orders. Back on `/activity`, which
  // is where tasks are made — goals moved out in T13 and the helpers never navigate.
  await page.goto("/activity")
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

  await page.goto("/goals")
  await expect(card(page)).toContainText("2 open")

  // --- Unfiltered, all three are on the board. Back to `/activity` first: the count above
  // is read from the goal card and the rows below are read from the task list, and since
  // T13 those are two pages.
  await page.goto("/activity")
  await expect(visibleCard(page, OTHER)).toHaveCount(1)

  // --- Filtered, the unrelated one is gone and the overdue one still reads as overdue.
  // The card is on `/goals` and LINKS to `/activity?goal=`, so this hop is the navigation
  // rather than a filter click. The filter itself is unchanged from T10.
  await page.goto("/goals")
  await card(page)
    .getByRole("link", { name: `Show tasks for ${GOAL}` })
    .click()
  await expect(page).toHaveURL(/\/activity\?goal=/)
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
  await page.goto("/goals")
  await expect(card(page)).toContainText("1 open")

  // --- Finishing the rest reads as done rather than "0 open".
  await complete(page, OPEN)
  await page.goto("/goals")
  await expect(card(page)).toContainText("No open tasks")
})
