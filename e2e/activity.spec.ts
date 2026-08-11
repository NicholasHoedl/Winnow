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

/**
 * T10b, amended by T12a and again by T12d: what each surface on /activity may DO.
 *
 * The rule has not changed — **the rail never offers an action the task list beside it
 * already offers** — but where habits sit has, so it is worth restating rather than quietly
 * patching.
 *
 * Running a routine CREATES tasks, so it gets a button in the rail. A habit used to BE a
 * repeating task, whose tick was already a row in the list, so the rail showed a streak and
 * nothing clickable; T12a made it a quota with a log, generating no tasks at all, and the
 * `+1` appeared. T12d moved that `+1` out of the rail entirely — not because the rule
 * changed, but because the rail is `lg:` only, so on a phone the rule was being satisfied by
 * a surface that did not exist and a habit could not be logged from this page at all.
 *
 * Three assertions keep it honest across the move. The chip still has **no checkbox** — a
 * quota is not done-or-not-done, and a checkbox would lie about what "done" means for a
 * rate. It has **exactly one button**, which also pins "no chevron, no title link". And the
 * habit creates **no task**, which is what holds the two primitives apart.
 */

const ROUTINE = `E2E rail routine ${STAMP}`
const RITEM = `E2E rail step ${STAMP}`
const HABIT = `E2E rail habit ${STAMP}`

test("the rail runs a routine from one picker, not a button each", async ({
  page,
}) => {
  // --- A routine with one step, built on its own page.
  await page.goto("/activity/routines")
  await page.getByRole("button", { name: "New routine", exact: true }).click()
  const routineDialog = page.getByRole("dialog")
  await routineDialog.getByLabel("Name", { exact: true }).fill(ROUTINE)
  await routineDialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(visibleCard(page, ROUTINE)).toHaveCount(1)

  await visibleCard(page, ROUTINE)
    .getByRole("button", { name: "Add task", exact: true })
    .click()
  const itemDialog = page.getByRole("dialog")
  await itemDialog.getByLabel("Title", { exact: true }).fill(RITEM)
  await itemDialog.getByLabel("Days from run", { exact: true }).fill("0")
  await itemDialog.getByRole("button", { name: "Add", exact: true }).click()
  // Load-bearing, and its absence was a 60-second flake. `.click()` waits for the click to
  // dispatch, NOT for the server action behind it — `addRoutineItem` does three sequential
  // round trips before returning. Navigating straight after it let `/activity` render from
  // a read taken before the INSERT landed, so the routine arrived with zero items and the
  // run dialog offered "Create 0 tasks". The dialog only closes on `ok`, so waiting for it
  // to hide is waiting for the write to be committed.
  await expect(itemDialog).toBeHidden()

  // --- The rail counts it and links to it, and one control runs any of them.
  await page.goto("/activity")
  // Two copies are in the DOM — the rail's and the phone's — and exactly one is ever
  // shown, so the filter is what picks the right one at whatever width this runs at.
  const line = page.getByTestId("routines-line").filter({ visible: true })
  await expect(line).toHaveCount(1)
  await expect(line).toContainText("Routines")

  // The demotion, pinned. A Run button PER routine is what made the rail grow without
  // bound — 724px for three goals, two routines and three habits — so if one ever comes
  // back this goes red rather than the height quietly regressing.
  await expect(
    page.getByRole("button", { name: `Run ${ROUTINE}` }),
  ).toHaveCount(0)

  await line.getByRole("button", { name: "Run…" }).click()
  await page.getByRole("menuitem", { name: new RegExp(ROUTINE) }).click()

  // Asserted BEFORE it is clicked, on purpose. This button's label is derived from the
  // routine's item count, so a stale read renames it — and clicking a locator whose text
  // depends on the very thing that might be wrong turns a bad read into a silent 60s hang.
  // Asserting first fails in ten seconds saying "Create 1 task was never visible", which
  // points at the count. The test this replaced checked "1 step" in the rail for the same
  // reason; the rail no longer shows a step count, so the check moved here.
  const runDialog = page.getByRole("dialog")
  const create = runDialog.getByRole("button", {
    name: "Create 1 task",
    exact: true,
  })
  await expect(create).toBeVisible()
  await create.click()
  await expect(page.getByText("Added 1 task")).toBeVisible()

  // The task the run created is on the board beside the rail that created it.
  await expect(visibleCard(page, RITEM)).toHaveCount(1)

  // --- Cleanup.
  await page.goto("/activity")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const rows = visibleCard(page, RITEM)
  for (let i = 0; i < 5; i++) {
    const before = await rows.count()
    if (before === 0) break
    await rows.first().getByRole("button", { name: "Task actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(rows).toHaveCount(before - 1)
  }
  await expect(rows).toHaveCount(0)

  await page.goto("/activity/routines")
  await visibleCard(page, ROUTINE)
    .getByRole("button", { name: /^Actions for / })
    .click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(visibleCard(page, ROUTINE)).toHaveCount(0)
})

test("a habit is logged from the strip, at every width", async ({ page }) => {
  // A habit built on its own page. Default cadence, which the dialog opens on: 3 × a week.
  await page.goto("/activity/habits")
  await page.getByRole("button", { name: "New habit", exact: true }).click()
  const habitDialog = page.getByRole("dialog")
  await habitDialog.getByLabel("Title", { exact: true }).fill(HABIT)
  await habitDialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(visibleCard(page, HABIT)).toHaveCount(1)

  // --- Desktop.
  await page.goto("/activity")
  const chip = page.getByTestId("habit-chip").filter({ hasText: HABIT })
  await expect(chip).toHaveCount(1)
  // Still no checkbox, and still for a reason — see the block comment above.
  await expect(chip.getByRole("checkbox")).toHaveCount(0)
  // Exactly one: the log control. No chevron and no title link, which is what keeps a tap
  // on a phone unambiguous.
  await expect(chip.getByRole("button")).toHaveCount(1)
  await chip.getByRole("button", { name: `Log ${HABIT}` }).click()
  await expect(chip).toContainText("1/3")

  // The load-bearing negative: a habit creates NO task. Before T12a this same title would
  // have been a row in the list beside the rail.
  //
  // It is also the ONLY thing testing the `data-rail` attribute on the chip. `visibleCard`
  // is `div.bg-card:not([data-rail])`, so dropping that attribute inverts this to 1 — and
  // then every prefix cleanup loop in the suite can match a chip and hang waiting for a
  // "Task actions" button it does not have.
  await expect(visibleCard(page, HABIT)).toHaveCount(0)

  // --- A phone. The whole reason the strip exists: below `lg` the rail is not rendered, so
  // until T12d this action was simply unavailable here.
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/activity")
  await expect(chip).toBeVisible()
  await chip.getByRole("button", { name: `Log ${HABIT}` }).click()
  await expect(chip).toContainText("2/3")

  // Two horizontal scrollers now share this screen — the goal chips and this strip — which
  // is the specific risk the placement manages. Neither may push the page sideways.
  const overflows = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)

  // --- Cleanup. No rule to stop and no orphaned instances to sweep: the habit owns its own
  // row and its entries cascade with it. That is a property of the design rather than luck
  // — T7c's teardown here had to do both, in a specific order, or it leaked a rule that
  // generated a task every day forever.
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto("/activity/habits")
  await visibleCard(page, HABIT)
    .getByRole("button", { name: `${HABIT} actions` })
    .click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await page.getByRole("button", { name: "Delete habit", exact: true }).click()
  await expect(visibleCard(page, HABIT)).toHaveCount(0)
})
