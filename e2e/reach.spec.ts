import { test, expect, type Locator } from "./_test"

import { goalCard, visibleCard } from "./_card"
import { deleteGoalsMatching, seedGoal, seedMilestone } from "./_goals"
import { deleteHabitsMatching, seedHabit } from "./_habits"
import { deleteListsMatching, seedList } from "./_lists"
import { deleteTasksMatching, seedTask } from "./_tasks"

/**
 * Pass 6's rule, made measurable: **a control you are meant to hit is at least as big as
 * its floor, whatever size its ink is.**
 *
 * Fitts's law says the time to hit a target falls with its size, and WCAG 2.2 AA puts a
 * number on the bottom of that: 24 × 24 CSS px. The app already knows the technique — a
 * `Checkbox` draws a 16px box inside a much larger invisible hit area — but it was applied
 * once and not again, so the walk found links 16px tall and icon buttons drawn at 14.
 *
 * Measured at 393px, the phone width, because that is where a finger does the pointing and
 * where the smallest of these live.
 *
 * `boundingBox()` is the border box, which is exactly the point: a hit area made of padding
 * or a negative margin is measurable here, and every fix in this pass is made of those. A
 * `Checkbox`'s `after:` pseudo-element is NOT — so the checkboxes are left to their own
 * pattern rather than asserted against here.
 *
 * Soft assertions throughout: one run should report every control that is too small, not
 * the first one.
 */

const PHONE = { width: 393, height: 852 }

/** WCAG 2.2 AA's floor for any target. */
const TARGET = 24

/**
 * A row's own control matches the row: the height of `Input` and of a default `Button`.
 * A title that fills its row and a capture bar that fills its box are both this.
 */
const ROW = 32

/**
 * Chrome that is touched every day — a card's fold, a stat tile's arrow, a drag grip —
 * clears the floor rather than sitting on it. Still well under a comfortable 44pt, which
 * these cannot have without redrawing the surfaces they sit in.
 */
const DAILY = 28

const PREFIX = "E2E reach"

async function box(locator: Locator, what: string) {
  await expect(locator, what).toBeVisible()
  const measured = await locator.boundingBox()
  if (!measured) throw new Error(`${what}: no box`)
  const width = Math.round(measured.width)
  const height = Math.round(measured.height)
  // Printed on every run, pass or fail: the numbers are the finding, and a green run that
  // says nothing cannot be compared with the walk that produced this file.
  console.log(`reach: ${what} — ${width} × ${height}`)
  return { width, height, left: Math.round(measured.x) }
}

/** An icon button or an arrow: as wide as it is tall, so both directions are checked. */
async function target(locator: Locator, floor: number, what: string) {
  const { width, height } = await box(locator, what)
  expect.soft(height, `${what} height`).toBeGreaterThanOrEqual(floor)
  expect.soft(width, `${what} width`).toBeGreaterThanOrEqual(floor)
}

/** A link or a row, wide already: height is the direction that can fail. */
async function tall(locator: Locator, floor: number, what: string) {
  const { height } = await box(locator, what)
  expect.soft(height, `${what} height`).toBeGreaterThanOrEqual(floor)
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(PHONE)
})

// Habits before goals: a habit's `goal_id` is ON DELETE SET NULL, so deleting the goal
// first leaves the habit behind with nothing pointing at it.
test.afterAll(async () => {
  await deleteHabitsMatching(PREFIX)
  await deleteTasksMatching(PREFIX)
  await deleteGoalsMatching(PREFIX)
  await deleteListsMatching(PREFIX)
})

test("the dashboard's rows, links and chrome are big enough to hit", async ({
  page,
}) => {
  const stamp = Date.now()
  const task = `${PREFIX} slate task ${stamp}`
  // Undated, so it lands in Slate's "Later" band — the same `TaskRow` every dated task
  // uses, without the spec having to know the account's time zone.
  await seedTask({ title: task })
  // The Practice card renders nothing for an account with no HABITS — a goal alone is not
  // enough — and two of the four "see all" links live on it.
  const goalId = await seedGoal({ title: `${PREFIX} dashboard goal ${stamp}` })
  await seedHabit({ title: `${PREFIX} dashboard habit ${stamp}`, goalId })

  await page.goto("/")

  await tall(page.getByLabel("Quick add a task"), ROW, "quick capture input")

  const slate = page.locator('[data-card="slate"]')
  await tall(slate.getByRole("link", { name: task }), ROW, "slate task title")
  await tall(slate.getByRole("link", { name: /^All/ }), TARGET, "slate All →")
  await tall(
    page
      .locator('[data-card="categories"]')
      .getByRole("link", { name: /^All/ }),
    TARGET,
    "categories All →",
  )

  const practice = page.locator('[data-card="goals"]')
  await tall(
    practice.getByRole("link", { name: /^Goals/ }),
    TARGET,
    "practice Goals →",
  )
  await tall(
    practice.getByRole("link", { name: /^Habits/ }),
    TARGET,
    "practice Habits →",
  )

  await target(
    slate.getByRole("button", { name: /^(Collapse|Expand) Slate$/ }),
    DAILY,
    "slate fold",
  )
  await target(
    page.getByRole("link", { name: "Open Macros" }),
    DAILY,
    "macros arrow",
  )
  await target(
    page.getByRole("link", { name: "Open Budget" }),
    DAILY,
    "budget arrow",
  )
})

test("the activity page's grips, checklists and disclosure are big enough to hit", async ({
  page,
}) => {
  const stamp = Date.now()
  const title = `${PREFIX} checklist ${stamp}`
  const step = `${PREFIX} step ${stamp}`
  const finished = `${PREFIX} finished ${stamp}`
  await seedTask({ title })
  await seedTask({ title: finished, status: "done" })
  // The task dialog's link picker is behind a disclosure that renders only when there is
  // something to link to.
  await seedGoal({ title: `${PREFIX} activity goal ${stamp}` })

  await page.goto("/activity")
  const row = visibleCard(page, title)
  await expect(row).toHaveCount(1)

  await target(
    page.getByRole("button", { name: `Reorder ${title}` }),
    DAILY,
    "drag grip",
  )

  // A brand-new task has no checklist and no chevron; the row menu is the way in.
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Add a subtask" }).click()
  const add = row.getByLabel("Add a subtask")
  await add.fill(step)
  await add.press("Enter")
  await expect(row.getByText(step, { exact: true })).toBeVisible()

  await target(
    row.getByRole("button", { name: `Hide subtasks of ${title}` }),
    TARGET,
    "subtask fold",
  )
  await target(
    row.getByRole("button", { name: `Delete ${step}` }),
    TARGET,
    "subtask delete",
  )

  // The done section is inset by the drag handle's width plus its gap (T38), so a done
  // card starts on the same left edge as the open cards above it. Growing the grip moves
  // that edge, and this is what says both moved together.
  await page.getByRole("button", { name: "All", exact: true }).click()
  const open = await box(visibleCard(page, title), "open task card")
  const closed = await box(visibleCard(page, finished), "done task card")
  expect.soft(closed.left, "done card left edge").toBe(open.left)
  expect.soft(closed.width, "done card width").toBe(open.width)

  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await tall(
    dialog.getByText(/^Link to a goal/),
    TARGET,
    "task dialog link disclosure",
  )
})

test("the goal editor's rows and disclosures are big enough to hit", async ({
  page,
}) => {
  const stamp = Date.now()
  const goal = `${PREFIX} editor goal ${stamp}`
  const milestone = `${PREFIX} milestone ${stamp}`
  const task = `${PREFIX} goal task ${stamp}`
  const goalId = await seedGoal({ title: goal })
  await seedMilestone({ goalId, title: milestone })

  await page.goto("/goals")
  await goalCard(page, goal)
    .getByRole("button", { name: `Open ${goal}` })
    .click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()

  const addTask = dialog.getByLabel("Add a task")
  await addTask.fill(task)
  await addTask.press("Enter")
  await expect(
    dialog.getByRole("button", { name: `Delete ${task}` }),
  ).toBeVisible()

  await tall(
    dialog.getByRole("button", { name: "Details" }),
    TARGET,
    "goal Details disclosure",
  )
  await tall(
    dialog.getByRole("link", { name: /^Show on the Tasks page/ }),
    TARGET,
    "goal tasks link",
  )
  await target(
    dialog.getByRole("button", { name: `Make a task from ${milestone}` }),
    TARGET,
    "milestone to task",
  )
  await target(
    dialog.getByRole("button", { name: `Delete ${milestone}` }),
    TARGET,
    "milestone delete",
  )
  await target(
    dialog.getByRole("button", { name: `Delete ${task}` }),
    TARGET,
    "goal task delete",
  )
})

test("the meals dialog's extra fields open from a big enough target", async ({
  page,
}) => {
  await page.goto("/meals")
  await page.getByRole("button", { name: "Log food" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await tall(
    page.getByText("More nutrition (optional)"),
    TARGET,
    "nutrition disclosure",
  )
})

test("the lists page's names fill their rows", async ({ page }) => {
  const name = `${PREFIX} list ${Date.now()}`
  await seedList({ name })

  await page.goto("/activity/lists")
  await tall(
    page.getByRole("link", { name: "Unfiled" }),
    TARGET,
    "Unfiled link",
  )
  await tall(page.getByRole("link", { name }), TARGET, "list name link")
})
