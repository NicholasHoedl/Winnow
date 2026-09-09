import { test, expect, type Page } from "./_test"

import { visibleCard } from "./_card"
import { addGoal, deleteGoalsMatching } from "./_goals"
import { announces, meter } from "./_habits"

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
  await deleteGoalsMatching("E2E act ")
})

test("the goal filter scopes the list, and the URL remembers which", async ({
  page,
}) => {
  // T13 changed the TRIGGER and nothing else. The rail is gone; the filter is a menu in the
  // toolbar, `selectGoal` is untouched, and `?goal=` means what it always did — which is
  // why this test kept its assertions and changed only how it clicks.
  await page.goto("/goals")
  await addGoal(page, { title: GOAL_A })
  await addGoal(page, { title: GOAL_B })

  // Back to `/activity` for the TASKS. `_goals.ts` and `createLinkedTask` both refuse to
  // navigate on purpose — a `goto` hidden in a helper is how a spec ends up asserting
  // against a page it did not mean to be on — so splitting goals onto their own page means
  // the spec says where it is, every time.
  await page.goto("/activity")
  await createLinkedTask(page, TASK_A, GOAL_A)
  await createLinkedTask(page, TASK_B, GOAL_B)

  await page.goto("/activity")
  await expect(visibleCard(page, TASK_A)).toHaveCount(1)
  await expect(visibleCard(page, TASK_B)).toHaveCount(1)

  // Selecting A hides B's work — the filter excludes, which is the part it can get wrong.
  await page.getByRole("button", { name: "Filter by goal" }).click()
  await page.getByRole("menuitem", { name: GOAL_A }).click()
  await expect(visibleCard(page, TASK_A)).toHaveCount(1)
  await expect(visibleCard(page, TASK_B)).toHaveCount(0)

  // Switching straight from one goal to another, without clearing first.
  await page.getByRole("button", { name: "Filter by goal" }).click()
  await page.getByRole("menuitem", { name: GOAL_B }).click()
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
  await page.goto("/goals")
  await addGoal(page, { title: GOAL_A })
  await page.goto("/activity")
  await createLinkedTask(page, TASK_A, GOAL_A)

  await page.goto("/activity?goal=00000000-0000-4000-8000-000000000000")
  await expect(visibleCard(page, TASK_A)).toHaveCount(1)
  // And it does not claim to be filtered by something that isn't there.
  await expect(page.getByRole("button", { name: /^Clear the / })).toHaveCount(0)
})

test("the goal filter works on a phone, and nothing scrolls sideways", async ({
  page,
}) => {
  // This used to assert a chip scroller, because the rail was `lg:` only and a goal had two
  // presentations — a card on desktop, a chip on a phone. T13 removed the second: `/goals`
  // renders one card at every width and the filter is one menu at every width, so what is
  // left to prove here is that the phone gets the SAME control rather than a lesser one.
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/goals")
  await addGoal(page, { title: GOAL_A })
  await addGoal(page, { title: GOAL_B })
  await page.goto("/activity")
  await createLinkedTask(page, TASK_A, GOAL_A)
  await createLinkedTask(page, TASK_B, GOAL_B)

  await page.goto("/activity")

  await expect(page.getByTestId("goal-chip")).toHaveCount(0)
  await page.getByRole("button", { name: "Filter by goal" }).click()
  await page.getByRole("menuitem", { name: GOAL_A }).click()
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
 * T10b, amended by T12a, T12d and T25: what the Tasks page may DO about practice.
 *
 * The rule has not changed — **the rail never offers an action the task list beside it
 * already offers** — and T25 answered it by subtraction. Running a routine CREATES tasks
 * and logging a habit is not a task at all, which is why each earned a surface on this page
 * (a Run button per routine, a `+1` per habit) while the page was the only door to either.
 * The section's strip made both pages one pill away, and the user asked for the overlap
 * gone: the Tasks page is tasks. Routines run from `/activity/routines` (`routines.spec.ts`
 * proves the tasks land here); a habit logs from `/activity/habits` and from the dashboard
 * card, which is what carries the phone-shaped case the strip existed for.
 *
 * Two assertions keep it honest across the move. The card still has **no checkbox** — a
 * quota is not done-or-not-done, and a checkbox would lie about what "done" means for a
 * rate. And the habit creates **no task**, which is what holds the two primitives apart.
 */

const HABIT = `E2E rail habit ${STAMP}`

test("a habit makes no task, and logs from the dashboard at every width", async ({
  page,
}) => {
  // A habit built on its own page. Default cadence, which the dialog opens on: 3 × a week.
  await page.goto("/activity/habits")
  await page.getByRole("button", { name: "New habit", exact: true }).click()
  const habitDialog = page.getByRole("dialog")
  await habitDialog.getByLabel("Title", { exact: true }).fill(HABIT)
  await habitDialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(visibleCard(page, HABIT)).toHaveCount(1)

  // The load-bearing negative: a habit creates NO task — and, since T25, nothing else on
  // the Tasks page either. Before T12a this same title would have been a row in the list.
  await page.goto("/activity")
  await expect(visibleCard(page, HABIT)).toHaveCount(0)
  await expect(page.getByText(HABIT)).toHaveCount(0)

  // --- Desktop: the dashboard card logs it.
  await page.goto("/")
  const card = page.locator('[data-card="goals"]')
  // Still no checkbox, and still for a reason — see the block comment above.
  await expect(card.getByRole("checkbox")).toHaveCount(0)
  await card.getByRole("button", { name: `Log ${HABIT}` }).click()
  await expect(meter(card, HABIT)).toHaveAttribute(
    "aria-valuetext",
    announces(1, 3, "this week"),
  )

  // --- A phone. Logging a practice is the most phone-shaped action in the app — the reason
  // the strip sat on `/activity` from T12d — and the card is what carries that now, at
  // every width, so it is asserted at one.
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await expect(card).toBeVisible()
  await card.getByRole("button", { name: `Log ${HABIT}` }).click()
  await expect(meter(card, HABIT)).toHaveAttribute(
    "aria-valuetext",
    announces(2, 3, "this week"),
  )
  // Nothing on the dashboard may push the page sideways at this width either.
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
