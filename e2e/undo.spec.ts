import { test, expect } from "./_test"

import { visibleCard } from "./_card"

// Coverage for the two undo paths that had none: task delete and milestone delete.
//
// T5a-S1 put a Zod guard on `restoreTask` and `restoreMilestone` — a Server Action is a
// public RPC endpoint, so the typed `task: Task` parameter guarded nothing at runtime. That
// gate sits between the row `.returning()` hands back and the re-insert, and it has to
// accept a real row: Dates crossing the RSC boundary, nullable columns, date-only strings.
// A schema that is subtly too strict wouldn't fail a typecheck or a unit test — it would
// fail silently in the browser as "Please fix the errors below." on the undo toast.
//
// So these specs assert the row comes BACK, not merely that it went away.
//
// `exact: true` on the Undo button is load-bearing. T5a gave tasks and goals drag handles
// labelled `Reorder <title>`, and this spec's goal is titled "E2E undo goal …" — a loose
// name match found both and failed on a strict-mode violation nowhere near the cause.

// Cleanup here as well as inline. This spec leaked a goal when it failed on a locator
// collision — end-of-body cleanup is skipped entirely when an assertion aborts the test,
// which is the fourth time that has bitten in this tranche.
test.afterEach(async ({ page }) => {
  await page.goto("/todos")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const tasks = visibleCard(page, "E2E undo task ")
  for (let i = 0; i < 6; i++) {
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
  const goals = visibleCard(page, "E2E undo goal ")
  for (let i = 0; i < 6; i++) {
    const before = await goals.count()
    if (before === 0) break
    await goals.first().getByRole("button", { name: "Goal actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await page.getByRole("button", { name: "Delete goal" }).click()
    await expect(goals).toHaveCount(before - 1)
  }
  await expect(goals).toHaveCount(0)
})

test("deleting a task can be undone", async ({ page }) => {
  const title = `E2E undo task ${Date.now()}`
  const row = () => visibleCard(page, title)

  await page.goto("/todos")
  const input = page.getByLabel("Quick add task")
  await input.fill(title)
  await input.press("Enter")
  await expect(row()).toHaveCount(1)

  await row().getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row()).toHaveCount(0)

  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(row()).toHaveCount(1)

  // …and it survives a reload, so undo really re-inserted rather than just un-hiding.
  await page.reload()
  await expect(row()).toHaveCount(1)

  // Cleanup.
  await row().getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row()).toHaveCount(0)
})

test("deleting a milestone can be undone, and keeps its position", async ({
  page,
}) => {
  const stamp = Date.now()
  const goalTitle = `E2E undo goal ${stamp}`
  const first = `alpha ${stamp}`
  const second = `bravo ${stamp}`
  const card = () => visibleCard(page, goalTitle)

  await page.goto("/goals")
  await page.getByRole("button", { name: "Add goal" }).click()
  await page.getByLabel("Title", { exact: true }).fill(goalTitle)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(card()).toHaveCount(1)

  // Two milestones, so a restored one has a position it could get wrong. Before S1 gave
  // addMilestone a real sortOrder writer, every row was 0.
  for (const title of [first, second]) {
    const add = card().getByPlaceholder("Add a milestone")
    await add.fill(title)
    await add.press("Enter")
    await expect(card().getByText(title)).toBeVisible()
  }

  await card()
    .getByRole("button", { name: `Delete ${first}` })
    .click()
  await expect(card().getByText(first)).toHaveCount(0)

  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(card().getByText(first)).toBeVisible()
  await page.reload()
  await expect(card().getByText(first)).toBeVisible()

  // Restored ahead of the one added after it — the sortOrder round-tripped.
  const titles = await card().getByRole("listitem").allInnerTexts()
  const order = titles.filter((t) => t.includes(String(stamp)))
  expect(order[0]).toContain("alpha")
  expect(order[1]).toContain("bravo")

  // Cleanup: deleting the goal cascades the milestones.
  await card().getByRole("button", { name: "Goal actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  const confirm = page.getByRole("button", { name: "Delete goal" })
  if (await confirm.count()) await confirm.click()
  await expect(card()).toHaveCount(0)
})
