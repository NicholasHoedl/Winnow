import { test, expect, type Page } from "./_test"

import { pageAction } from "./_menu"

import { goalCard, visibleCard } from "./_card"
import { addGoal, deleteGoal, openGoalDetail } from "./_goals"
import { announces, meter } from "./_habits"
import { deleteTasksMatching } from "./_tasks"

/**
 * Browser coverage for T9a: generating a plan, pruning and editing it, and applying it.
 *
 * The provider is `e2e/_ai-stub.mjs`, reached through `AI_BASE_URL` exactly as a real one
 * would be — the call is made server-side, so `page.route()` could never intercept it.
 * That means everything except the model's judgment is under test here: the route handler,
 * the Zod parse, the proposal row, the renderer, the finalize-and-renumber step, and the
 * writes through the goals and todos actions.
 *
 * What is deliberately NOT tested is whether the plan is any good. That is unassertable,
 * and ADR-0011 accepts it as a permanent gap rather than pretending otherwise.
 */

/**
 * Every page that hosts an AI tool, and the panel heading that proves it rendered.
 *
 * T13 dispersed the four jobs; `/companion` no longer exists. Kept as one spec file rather
 * than split four ways because the FEATURE is one thing — the same hook, the same route
 * handler, the same renderers — and splitting would have meant four copies of the queue
 * cleaner below, which is the part most likely to rot.
 */
const TOOL_PAGES = [
  ["/goals", "Plan a goal"],
  ["/activity/routines", "Build a routine"],
  ["/review", "Read my week"],
  ["/budget", "Read transactions"],
] as const

/**
 * Empty one page's pending queue before each test.
 *
 * Each page opens whatever proposal of ITS kind is oldest-pending, which is correct
 * behaviour — a generation you paid for should survive a reload — and it makes these specs
 * order-dependent unless the queue starts empty. Without this, one failing test leaves a
 * proposal behind and the NEXT test opens holding it, failing for a reason that has
 * nothing to do with what it covers. That misdiagnosis cost time twice.
 *
 * Per-page since T13, because `getPendingProposals(kind)` means a proposal is only visible
 * where it belongs — a stray import is invisible on `/goals` and cannot be dismissed from
 * there. `clearAllQueues` sweeps every page for the `beforeEach`.
 */
async function clearQueue(page: Page, route: string) {
  // Reloads each round on purpose: it has to check the SERVER's idea of what is pending,
  // not the page's. Asserting against local state after a dismiss passes whether or not
  // the write actually landed — which is exactly the bug this loop uncovered.
  for (let i = 0; i < 20; i++) {
    await page.goto(route)
    // Whatever is on screen: plans, routines and imports offer Discard, a summary Done.
    const dismiss = page.getByRole("button", { name: /^(Discard|Done)$/ })
    if ((await dismiss.count()) === 0) return
    await dismiss.first().click()
    await expect(dismiss).toHaveCount(0)
  }
  throw new Error(`The pending queue on ${route} would not empty.`)
}

async function clearAllQueues(page: Page) {
  for (const [route] of TOOL_PAGES) await clearQueue(page, route)
}

test.beforeEach(async ({ page }) => {
  await clearAllQueues(page)
})

async function createGoal(page: Page, title: string) {
  await page.goto("/goals")
  await addGoal(page, { title })
}

async function removeGoal(page: Page, title: string) {
  await page.goto("/goals")
  await deleteGoal(page, title)
}

/** Tasks survive their goal's deletion (ON DELETE set null), so clean them separately. */
async function planGoal(page: Page, goalTitle: string) {
  await page.goto("/goals")
  // `getByRole("combobox")`, not `getByLabel("Goal")`. The tool panel is a `<section>` named
  // "Plan a goal", and `getByLabel` matches substrings — so a label lookup for "Goal" found
  // the region AND the select. Naming the role disambiguates without weakening anything.
  await page.getByRole("combobox", { name: "Goal" }).click()
  await page.getByRole("option", { name: goalTitle }).click()
  // `exact`, because "Revise the plan" also matches a loose "Plan".
  await page.getByRole("button", { name: "Plan", exact: true }).click()
  await expect(page.getByText("Proposed plan")).toBeVisible()
}

test("a generated plan can be pruned, edited, and applied", async ({
  page,
}) => {
  const goalTitle = `E2E companion ${Date.now()}`
  await createGoal(page, goalTitle)
  await planGoal(page, goalTitle)

  // The T12c shape: a ladder, one recurring practice, one genuine one-off.
  await expect(
    page.getByText("Creates 2 milestones, 1 habit and 1 task"),
  ).toBeVisible()

  // Pruning a milestone no longer takes anything with it. `milestoneIndex` retired in
  // T12c, so the three lists are independent — and a whole class of renumbering bug went
  // with it.
  await page
    .getByRole("checkbox", { name: "Include STUB second milestone" })
    .click()
  await expect(
    page.getByText("Creates 1 milestone, 1 habit and 1 task"),
  ).toBeVisible()

  // Editing in place: the row is an input, so there is no edit mode to enter.
  const renamed = `${goalTitle} renamed milestone`
  await page.getByLabel("Milestone 1 title").fill(renamed)
  // The RATE is editable too, which is the correction people actually make: 3 a week down
  // to 2. Nothing else about a habit needs fixing before it is created.
  await page.getByLabel("Habit 1 times per week").fill("2")

  await page.getByRole("button", { name: "Apply" }).click()

  // **Applying does NOT navigate any more, and that is the assertion.** On `/companion` it
  // pushed you to `/activity`, because the milestones and habits it created were not on the
  // page you were looking at. They are now: this IS the goals page, `useProposal` is given
  // no `onApplied`, and its default refreshes in place. Staying put is the whole payoff of
  // moving the tool to its artifact, so it is worth pinning rather than assuming.
  await expect(page).toHaveURL(/\/goals/)
  await openGoalDetail(page, goalTitle)
  const detail = page.getByRole("dialog")
  await expect(detail.getByText(renamed)).toBeVisible()
  // The excluded milestone was never created.
  await expect(detail.getByText("STUB second milestone")).toHaveCount(0)
  await page.keyboard.press("Escape")

  // The assertion the whole T12 line exists for: the companion proposed a PRACTICE, and it
  // landed as a real habit at the edited rate — not as a dated checklist item. Read off the
  // quota meter, because that rate is no longer written as text anywhere: a habit's quota is
  // drawn as one box per log you owe, and what the meter announces carries the numbers now.
  await page.goto("/activity/habits")
  await expect(
    meter(visibleCard(page, "STUB practice"), "STUB practice"),
  ).toHaveAttribute("aria-valuetext", announces(0, 2, "this week"))

  // The setup task is a real task linked to the goal, so it still counts toward momentum.
  // The goal card's body is a LINK to the filtered list since T13, not an in-place filter.
  await page.goto("/goals")
  await goalCard(page, goalTitle)
    .getByRole("link", { name: `Show tasks for ${goalTitle}` })
    .click()
  await expect(visibleCard(page, "STUB setup task")).toBeVisible()

  // The habit outlives its goal (`goal_id` is set null), so it is removed explicitly.
  await page.goto("/activity/habits")
  await visibleCard(page, "STUB practice")
    .getByRole("button", { name: "STUB practice actions" })
    .click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await page.getByRole("button", { name: "Delete habit", exact: true }).click()
  await expect(visibleCard(page, "STUB practice")).toHaveCount(0)

  await removeGoal(page, goalTitle)
  await deleteTasksMatching("STUB setup task")
})

test("a refinement replaces the proposal rather than stacking another", async ({
  page,
}) => {
  const goalTitle = `E2E refine ${Date.now()}`
  await createGoal(page, goalTitle)
  await planGoal(page, goalTitle)
  await expect(
    page.getByText("Creates 2 milestones, 1 habit and 1 task"),
  ).toBeVisible()

  await page.getByLabel("Change this plan").fill("make it shorter")
  await page.getByRole("button", { name: "Revise the proposal" }).click()

  // The stub answers differently when it sees a revision request, which is how we know
  // the instruction reached it rather than a second first-draft being generated.
  //
  // Asserted by VALUE, not text: titles on this surface are always-editable inputs, so
  // there is no text node to match.
  await expect(page.getByLabel("Milestone 1 title")).toHaveValue(
    "STUB refined milestone",
  )
  await expect(
    page.getByText("Creates 1 milestone, 1 habit and 0 tasks"),
  ).toBeVisible()
  // Revised in place, not stacked. This used to be asserted against `/companion`'s pending
  // queue — "no second entry named after this goal" — and that queue does not exist now:
  // each page opens its own kind and shows one proposal. The equivalent claim on this page
  // is that there is exactly ONE proposal on screen, which is what a second generation
  // would break.
  //
  // Counting `Apply` rather than the goal title: `/goals` renders the goal LIST beside the
  // proposal, and every card carries "Reorder <title>" and "Open <title>" buttons, so a
  // title-based locator matches the card and not the queue it was written for.
  await expect(page.getByRole("button", { name: "Apply" })).toHaveCount(1)

  await page.getByRole("button", { name: "Discard", exact: true }).click()
  // `/companion` had an empty-state pane reading "Nothing proposed yet"; the dispersed
  // pages have no placeholder, because the renderer simply is not rendered. Absence of the
  // dismissal control is the same claim, made against what is actually on screen.
  await expect(
    page.getByRole("button", { name: /^(Discard|Done)$/ }),
  ).toHaveCount(0)

  await removeGoal(page, goalTitle)
})

test("a discarded proposal creates nothing and leaves the queue empty", async ({
  page,
}) => {
  const goalTitle = `E2E discard ${Date.now()}`
  await createGoal(page, goalTitle)
  await planGoal(page, goalTitle)

  await page.getByRole("button", { name: "Discard", exact: true }).click()
  // `/companion` had an empty-state pane reading "Nothing proposed yet"; the dispersed
  // pages have no placeholder, because the renderer simply is not rendered. Absence of the
  // dismissal control is the same claim, made against what is actually on screen.
  await expect(
    page.getByRole("button", { name: /^(Discard|Done)$/ }),
  ).toHaveCount(0)

  await page.goto("/goals")
  await openGoalDetail(page, goalTitle)
  const detail = page.getByRole("dialog")
  await expect(detail.getByText("STUB first milestone")).toHaveCount(0)
  await expect(detail.getByText("No milestones or target yet.")).toBeVisible()
  await page.keyboard.press("Escape")

  await removeGoal(page, goalTitle)
})

/** Routine cards live on /activity/routines and delete behind a confirm. */
async function deleteRoutines(page: Page, fragment: RegExp) {
  await page.goto("/activity/routines")
  const cards = visibleCard(page, fragment)
  for (let i = 0; i < 10; i++) {
    const count = await cards.count()
    if (count === 0) break
    await cards
      .first()
      .getByRole("button", { name: /^Actions for / })
      .click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await page.getByRole("button", { name: "Delete", exact: true }).click()
    await expect(cards).toHaveCount(count - 1)
  }
  await expect(cards).toHaveCount(0)
}

test("a generated routine can be pruned and applied", async ({ page }) => {
  await page.goto("/activity/routines")
  await page.getByLabel("Routine brief").fill("a morning routine before work")
  await page.getByRole("button", { name: "Build" }).click()
  await expect(page.getByText("Proposed routine")).toBeVisible()

  // Offsets are rendered in words, and the three cases must stay distinct: -1 is
  // preparation, 0 is the day itself, and null is no deadline at all. Collapsing any two
  // of them would be inventing or losing a due date.
  // `exact`, because the footer's span repeats these words in its span summary.
  await expect(page.getByText("1 day before", { exact: true })).toBeVisible()
  await expect(page.getByText("On the day", { exact: true })).toBeVisible()
  await expect(page.getByText("No date", { exact: true })).toBeVisible()
  await expect(page.getByText(/Creates a routine of 3 tasks/)).toBeVisible()
  await expect(page.getByText(/1 day before to on the day/)).toBeVisible()

  await page
    .getByRole("checkbox", { name: "Include STUB read something" })
    .click()
  await expect(page.getByText("Creates a routine of 2 tasks")).toBeVisible()

  await page.getByRole("button", { name: "Apply" }).click()

  // Still on the routines page — the tool is here, so applying does not navigate at all.
  // It used to push here from `/companion`; the URL is the same and the reason is not.
  await expect(page).toHaveURL(/\/activity\/routines/)
  const card = visibleCard(page, "STUB morning routine")
  await expect(card).toBeVisible()
  await expect(card.getByText("STUB make coffee")).toBeVisible()
  await expect(card.getByText("STUB read something")).toHaveCount(0)

  await deleteRoutines(page, /STUB morning routine/)
})

test("a routine refinement replaces the proposal in place", async ({
  page,
}) => {
  await page.goto("/activity/routines")
  await page.getByLabel("Routine brief").fill("a wind-down routine")
  await page.getByRole("button", { name: "Build" }).click()
  await expect(page.getByText("Proposed routine")).toBeVisible()

  await page.getByLabel("Change this routine").fill("just one step")
  await page.getByRole("button", { name: "Revise the proposal" }).click()

  await expect(page.getByLabel("Routine name")).toHaveValue(
    "STUB refined routine",
  )
  await expect(page.getByText("Creates a routine of 1 task")).toBeVisible()

  await page.getByRole("button", { name: "Discard", exact: true }).click()
  // `/companion` had an empty-state pane reading "Nothing proposed yet"; the dispersed
  // pages have no placeholder, because the renderer simply is not rendered. Absence of the
  // dismissal control is the same claim, made against what is actually on screen.
  await expect(
    page.getByRole("button", { name: /^(Discard|Done)$/ }),
  ).toHaveCount(0)
})

/**
 * Give the current week enough in it to be worth narrating.
 *
 * `summaryReadiness` refuses a thin week before spending a provider call, so a summary
 * test has to establish its own precondition rather than hope the dev database has one.
 * That refusal is unit-tested six ways in `service.test.ts`; what these specs prove is
 * the wiring above it.
 */
async function seedCompletedTasks(page: Page, prefix: string, count: number) {
  await page.goto("/activity")
  const input = page.getByLabel("Quick add task")
  for (let i = 0; i < count; i++) {
    await input.fill(`${prefix} ${i}`)
    await input.press("Enter")
  }
  await page.getByRole("button", { name: "All", exact: true }).click()
  for (let i = 0; i < count; i++) {
    const row = visibleCard(page, `${prefix} ${i}`)
    await expect(row).toBeVisible()
    await row.getByLabel("Mark as done").click()
    await expect(row.getByText(`${prefix} ${i}`, { exact: true })).toHaveClass(
      /line-through/,
    )
  }
}

test("a week is narrated read-only, with no way to apply it", async ({
  page,
}) => {
  const prefix = `E2E week ${Date.now()}`
  await seedCompletedTasks(page, prefix, 3)

  await page.goto("/review")
  await page.getByRole("button", { name: "Summarise this week" }).click()
  await expect(page.getByText("Your week")).toBeVisible()

  await expect(page.getByText("STUB a steady week")).toBeVisible()
  await expect(
    page.getByText("STUB you finished more on Wednesday than any other day."),
  ).toBeVisible()

  // The distinguishing property of this kind: a paragraph is not a row, so there is
  // nothing to prune and nothing to create. No checkboxes, no Apply — one Done.
  await expect(page.getByRole("checkbox")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Apply" })).toHaveCount(0)
  await expect(
    page.getByRole("link", { name: "See the figures behind this" }),
  ).toBeVisible()

  await page.getByRole("button", { name: "Done" }).click()
  // `/companion` had an empty-state pane reading "Nothing proposed yet"; the dispersed
  // pages have no placeholder, because the renderer simply is not rendered. Absence of the
  // dismissal control is the same claim, made against what is actually on screen.
  await expect(
    page.getByRole("button", { name: /^(Discard|Done)$/ }),
  ).toHaveCount(0)

  await deleteTasksMatching(prefix)
})

test("a summary refinement replaces it in place", async ({ page }) => {
  const prefix = `E2E refine week ${Date.now()}`
  await seedCompletedTasks(page, prefix, 3)

  await page.goto("/review")
  await page.getByRole("button", { name: "Summarise this week" }).click()
  await expect(page.getByText("STUB a steady week")).toBeVisible()

  await page.getByLabel("Change this summary").fill("be blunter")
  await page.getByRole("button", { name: "Revise the proposal" }).click()

  await expect(page.getByText("STUB refined headline")).toBeVisible()
  await expect(page.getByText("STUB a steady week")).toHaveCount(0)

  await page.getByRole("button", { name: "Done" }).click()
  // `/companion` had an empty-state pane reading "Nothing proposed yet"; the dispersed
  // pages have no placeholder, because the renderer simply is not rendered. Absence of the
  // dismissal control is the same claim, made against what is actually on screen.
  await expect(
    page.getByRole("button", { name: /^(Discard|Done)$/ }),
  ).toHaveCount(0)

  await deleteTasksMatching(prefix)
})

/**
 * Make sure the account owns an expense category called "Food", and say whether we made it.
 *
 * The stub names "Food" on exactly one of its three rows so that one matches and two do
 * not — see the note above `importFor` in `_ai-stub.mjs`. That arithmetic only holds if the
 * category exists, and it was simply ASSUMED to: on an account with none, all three land
 * uncategorised and the counts below are each off by one, which reads as "the matcher
 * broke" rather than "there was nothing to match against".
 *
 * The return value is kept even though T12g moved the suite onto `winnow_test`, where the
 * category can only ever be one this run made. It costs a boolean, and "delete only what
 * you created" is the habit that stops the next fixture — written when someone has once
 * again pointed a suite at something real — from being the one that does damage. It was
 * written for exactly that reason: deleting "Food" unconditionally used to destroy a real
 * category, the same class of mistake that once deleted the account's API key.
 */
async function ensureFoodCategory(page: Page): Promise<boolean> {
  await page.goto("/budget")
  await pageAction(page, "Manage categories")
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()

  if ((await dialog.getByText("Food", { exact: true }).count()) > 0) {
    await page.keyboard.press("Escape")
    return false
  }

  // The kind select defaults to Expense, which is what `checkCategory`'s type match needs.
  await dialog.getByLabel("Name").fill("Food")
  await dialog.getByRole("button", { name: "Add category" }).click()
  await expect(dialog.getByText("Food", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  return true
}

async function removeFoodCategory(page: Page) {
  await page.goto("/budget")
  await pageAction(page, "Manage categories")
  await page.getByRole("button", { name: "Delete Food" }).click()
  await page.getByRole("button", { name: "Delete category" }).click()
  await expect(page.getByText("Food", { exact: true })).toHaveCount(0)
  await page.keyboard.press("Escape")
}

test("pasted transactions are extracted, pruned and applied", async ({
  page,
}) => {
  const seededFood = await ensureFoodCategory(page)

  await page.goto("/budget")
  await page
    .getByLabel("Transactions to read")
    .fill("2026-07-14,TESCO,-42.10\n2026-07-16,SALARY,2400.00")
  await page.getByRole("button", { name: "Read them" }).click()
  await expect(page.getByText("Transactions found")).toBeVisible()

  // A row list, not the spine — 40 transactions on a timeline would be absurd.
  await expect(page.getByText("STUB TESCO")).toBeVisible()
  await expect(page.getByText("STUB SALARY")).toBeVisible()

  // Categories the model named are matched against the user's own, and anything that
  // does not match lands uncategorised rather than being coerced onto the nearest name.
  // Two of the three here cannot match: one invented name, one explicit null.
  await expect(page.getByText(/Creates 3 transactions/)).toBeVisible()
  await expect(page.getByText(/2 uncategorised/)).toBeVisible()

  await page.getByRole("checkbox", { name: "Include STUB UNKNOWNCO" }).click()
  await expect(page.getByText(/Creates 2 transactions/)).toBeVisible()
  await expect(page.getByText(/1 uncategorised/)).toBeVisible()

  await page.getByRole("button", { name: "Apply" }).click()

  // Still on the budget page, for the same reason the routine test stays on its own.
  await expect(page).toHaveURL(/\/budget/)
  await expect(visibleCard(page, "STUB TESCO")).toBeVisible()
  // The pruned row was never created.
  await expect(visibleCard(page, "STUB UNKNOWNCO")).toHaveCount(0)

  // Cleanup — the suite shares a persistent database and these inflate month totals.
  for (const payee of ["STUB TESCO", "STUB SALARY"]) {
    const row = visibleCard(page, payee)
    await row.getByRole("button", { name: "Transaction actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(visibleCard(page, payee)).toHaveCount(0)
  }

  // Only if this test was what created it. Deleting a category the owner already had would
  // take its budgets with it.
  if (seededFood) await removeFoodCategory(page)
})

test("an import refinement asks for an extraction, not a summary", async ({
  page,
}) => {
  // Regression cover for a fall-through nobody would have caught from behaviour: the
  // refinement request was built by a ternary chain that stopped at `routine`, so
  // refining an extraction asked the server for a WEEKLY SUMMARY — and the panel labelled
  // itself "Change this summary" while showing a table of transactions.
  await page.goto("/budget")
  await page.getByLabel("Transactions to read").fill("2026-07-14,TESCO,-42.10")
  await page.getByRole("button", { name: "Read them" }).click()
  await expect(page.getByText("Transactions found")).toBeVisible()
  await expect(page.getByText("Change this extraction")).toBeVisible()

  await page.getByLabel("Change this extraction").fill("drop the refunds")
  await page.getByRole("button", { name: "Revise the proposal" }).click()

  // Still an extraction. The stub answers a one-row table to a revision request; if the
  // request had gone out as `summary` this would be prose instead.
  await expect(page.getByText("Transactions found")).toBeVisible()
  await expect(page.getByText("STUB refined payee")).toBeVisible()
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible()

  await page.getByRole("button", { name: "Discard", exact: true }).click()
  // `/companion` had an empty-state pane reading "Nothing proposed yet"; the dispersed
  // pages have no placeholder, because the renderer simply is not rendered. Absence of the
  // dismissal control is the same claim, made against what is actually on screen.
  await expect(
    page.getByRole("button", { name: /^(Discard|Done)$/ }),
  ).toHaveCount(0)
})
