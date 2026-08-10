import { test, expect, type Page } from "./_test"
import { visibleCard } from "./_card"

// Two prefixes, because the sweep runs over two pages: routine cards live on
// /activity/routines and the tasks a run creates live on /activity.
const ROUTINE_PREFIX = "E2E routine"
const TASK_PREFIX = "E2E rtask"

/** A `<section>` on /activity, picked out by its heading. */
function section(page: Page, label: string) {
  return page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { level: 2, name: label, exact: true }),
    })
    .filter({ visible: true })
}

async function addRoutine(page: Page, name: string) {
  await page.getByRole("button", { name: "New routine", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Name", { exact: true }).fill(name)
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
