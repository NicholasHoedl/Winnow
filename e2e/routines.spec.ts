import { test, expect, type Page } from "./_test"
import { visibleCard } from "./_card"

// Two prefixes, because the sweep runs over two pages: routine cards live on
// /activity/routines and the tasks a run creates live on /activity.
const ROUTINE_PREFIX = "E2E routine"
const TASK_PREFIX = "E2E rtask"

/**
 * Yesterday as `YYYY-MM-DD`, from the machine's own clock.
 *
 * Good enough deliberately: the sweep only asks whether a due date is strictly before
 * today in the user's zone, and this machine runs in that zone. Being a day out either way
 * would still be "before today", which is the only property the test depends on.
 */
function yesterday(): string {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** A `<section>` on /activity, picked out by its heading. */
function section(page: Page, label: string) {
  return page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { level: 2, name: label, exact: true }),
    })
    .filter({ visible: true })
}

async function addRoutine(
  page: Page,
  name: string,
  /** T12f. Omitted means the column's default, `keep` — tasks go overdue as they always did. */
  onUnfinished?: "keep" | "drop",
) {
  await page.getByRole("button", { name: "New routine", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Name", { exact: true }).fill(name)
  if (onUnfinished === "drop") {
    await dialog
      .getByLabel("When a task isn't done by its due date", { exact: true })
      .click()
    await page.getByRole("option", { name: "Delete them" }).click()
  }
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(visibleCard(page, name)).toHaveCount(1)
}

async function addItem(
  page: Page,
  routineName: string,
  title: string,
  offsetDays: number,
) {
  const card = visibleCard(page, routineName)
  await card.getByRole("button", { name: "Add task", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(title)
  await dialog
    .getByLabel("Days from run", { exact: true })
    .fill(String(offsetDays))
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(card.getByText(title, { exact: true })).toBeVisible()
}

/** Run the routine from its card, taking the default anchor (today). */
async function runRoutine(page: Page, routineName: string, count: number) {
  await visibleCard(page, routineName)
    .getByRole("button", { name: "Run", exact: true })
    .click()
  const dialog = page.getByRole("dialog")
  const create = dialog.getByRole("button", {
    name: `Create ${count} tasks`,
    exact: true,
  })
  await expect(create).toBeVisible()
  await create.click()
  await expect(page.getByText(`Added ${count} tasks`)).toBeVisible()
}

test.afterEach(async ({ page }) => {
  // Routines first — deleting one cascades its items but never its spun-up tasks.
  await page.goto("/activity/routines")
  const routineCards = visibleCard(page, new RegExp(ROUTINE_PREFIX))
  for (let i = 0; i < 10; i++) {
    const count = await routineCards.count()
    if (count === 0) break
    await routineCards
      .first()
      .getByRole("button", { name: /^Actions for / })
      .click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await page.getByRole("button", { name: "Delete", exact: true }).click()
    await expect(routineCards).toHaveCount(count - 1)
  }
  await expect(routineCards).toHaveCount(0)

  // Then the tasks any run left behind.
  await page.goto("/activity")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const taskRows = visibleCard(page, new RegExp(TASK_PREFIX))
  for (let i = 0; i < 15; i++) {
    const count = await taskRows.count()
    if (count === 0) break
    await taskRows.first().getByRole("button", { name: "Task actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(taskRows).toHaveCount(count - 1)
  }
  await expect(taskRows).toHaveCount(0)
})

test("a routine's offsets become real due dates when it runs", async ({
  page,
}) => {
  const stamp = Date.now()
  const name = `${ROUTINE_PREFIX} trip ${stamp}`
  const before = `${TASK_PREFIX} kennel ${stamp}`
  const sameDay = `${TASK_PREFIX} leave ${stamp}`
  const after = `${TASK_PREFIX} unpack ${stamp}`

  // Establishes that none of these exist yet — and incidentally compiles /activity, which
  // otherwise lands on the far side of three dialogs and eats the test's whole budget
  // when this spec runs on its own.
  await page.goto("/activity")
  await expect(visibleCard(page, new RegExp(TASK_PREFIX))).toHaveCount(0)

  await page.goto("/activity/routines")
  await addRoutine(page, name)
  await addItem(page, name, before, -7)
  await addItem(page, name, sameDay, 0)
  await addItem(page, name, after, 2)

  await runRoutine(page, name, 3)

  // Which SECTION each task lands in is computed from the stored due date by
  // `bucketTasks`, not by the preview — so this checks the offsets actually reached
  // the database rather than re-reading the same calculation the dialog showed.
  await page.goto("/activity")
  await expect(section(page, "Overdue").getByText(before)).toBeVisible()
  await expect(section(page, "Today").getByText(sameDay)).toBeVisible()
  await expect(section(page, "Upcoming").getByText(after)).toBeVisible()
})

test("undo removes exactly the tasks a run created", async ({ page }) => {
  const stamp = Date.now()
  const name = `${ROUTINE_PREFIX} morning ${stamp}`
  const first = `${TASK_PREFIX} stretch ${stamp}`
  const second = `${TASK_PREFIX} journal ${stamp}`
  // A task that exists BEFORE the run, so undo removing everything would be caught.
  const bystander = `${TASK_PREFIX} bystander ${stamp}`

  await page.goto("/activity")
  const quickAdd = page.getByLabel("Quick add task")
  await quickAdd.fill(bystander)
  await quickAdd.press("Enter")
  await expect(visibleCard(page, bystander)).toHaveCount(1)

  await page.goto("/activity/routines")
  await addRoutine(page, name)
  await addItem(page, name, first, 0)
  await addItem(page, name, second, 0)
  await runRoutine(page, name, 2)

  // The toast is the only place undo is offered, so it has to be clicked before
  // navigating anywhere.
  await page.getByRole("button", { name: "Undo", exact: true }).click()

  await page.goto("/activity")
  await expect(visibleCard(page, first)).toHaveCount(0)
  await expect(visibleCard(page, second)).toHaveCount(0)
  await expect(visibleCard(page, bystander)).toHaveCount(1)
})

/**
 * T12f: a routine can be set to delete its own unfinished tasks once the day has passed.
 *
 * The two negative assertions matter more than the positive one. This sweep DELETES rows
 * with no undo, so the risk is not that it fails to fire — it is that it takes something it
 * shouldn't. A `keep` routine's stale task and a hand-written overdue task are both in the
 * same state the sweep looks for, and both have to survive it.
 *
 * A negative day offset is what makes this testable at all: the task is born already past
 * due, so the sweep is reachable without waiting for a day to turn over.
 *
 * Not covered here, because the UI cannot reach it: a COMPLETED routine task ageing past
 * its due date. Completing one requires visiting /activity, which runs the sweep — so a
 * task born overdue is gone before it can be ticked. The `status = 'open'` filter is
 * enforced in the query and stated in its comment.
 */
test("a drop routine deletes only its own unfinished tasks", async ({
  page,
}) => {
  const stamp = Date.now()
  const dropRoutine = `${ROUTINE_PREFIX} drop ${stamp}`
  const keepRoutine = `${ROUTINE_PREFIX} keep ${stamp}`
  const dropped = `${TASK_PREFIX} dropped ${stamp}`
  const kept = `${TASK_PREFIX} kept ${stamp}`
  const handwritten = `${TASK_PREFIX} handwritten ${stamp}`

  // A hand-written overdue task, created FIRST so it is already sitting there when the
  // sweep first runs. Its `routine_id` is null, and `NULL IN (…)` is null rather than
  // true — this is what proves the sweep cannot reach a task no routine created.
  await page.goto("/activity")
  await page.getByRole("button", { name: "New task" }).click()
  const taskDialog = page.getByRole("dialog")
  await taskDialog.getByLabel("Title", { exact: true }).fill(handwritten)
  await taskDialog.getByLabel("Due date").fill(yesterday())
  await taskDialog.getByRole("button", { name: "Create" }).click()
  await expect(taskDialog).toBeHidden()

  await page.goto("/activity/routines")
  await addRoutine(page, dropRoutine, "drop")
  await addItem(page, dropRoutine, dropped, -1)
  await addRoutine(page, keepRoutine)
  await addItem(page, keepRoutine, kept, -1)

  for (const name of [dropRoutine, keepRoutine]) {
    await visibleCard(page, name)
      .getByRole("button", { name: "Run", exact: true })
      .click()
    const runDialog = page.getByRole("dialog")
    const create = runDialog.getByRole("button", {
      name: "Create 1 task",
      exact: true,
    })
    await expect(create).toBeVisible()
    await create.click()
    await expect(page.getByText("Added 1 task")).toBeVisible()
  }

  // Both tasks exist at this point — the toasts said so. Reading /activity is what runs
  // the sweep, so the difference below is the sweep's doing and not a failure to create.
  await page.goto("/activity")
  await page.getByRole("button", { name: "All", exact: true }).click()

  await expect(visibleCard(page, kept)).toHaveCount(1)
  await expect(visibleCard(page, handwritten)).toHaveCount(1)
  await expect(visibleCard(page, dropped)).toHaveCount(0)

  // Cleanup for the hand-written one; `afterEach` covers the routines and `kept`.
  const row = visibleCard(page, handwritten)
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(visibleCard(page, handwritten)).toHaveCount(0)
})
