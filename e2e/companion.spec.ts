import { test, expect, type Page } from "./_test"

import { visibleCard } from "./_card"

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
 * Empty the pending queue before each test.
 *
 * `/companion` opens whatever proposal is oldest-pending, which is correct behaviour — a
 * generation you paid for should survive a reload — and it makes these specs
 * order-dependent unless the queue starts empty. Without this, one failing test leaves a
 * proposal behind and the NEXT test opens holding it, failing for a reason that has
 * nothing to do with what it covers. That misdiagnosis cost time twice.
 */
async function clearQueue(page: Page) {
  // Reloads each round on purpose: it has to check the SERVER's idea of what is pending,
  // not the page's. Asserting against local state after a dismiss passes whether or not
  // the write actually landed — which is exactly the bug this loop uncovered.
  for (let i = 0; i < 20; i++) {
    await page.goto("/companion")
    // Whatever is on screen: plans and routines offer Discard, a summary offers Done.
    const dismiss = page.getByRole("button", { name: /^(Discard|Done)$/ })
    if ((await dismiss.count()) === 0) {
      const queued = page.getByTestId("pending-queue").getByRole("button")
      if ((await queued.count()) === 0) {
        await expect(page.getByText("Nothing proposed yet")).toBeVisible()
        return
      }
      await queued.first().click()
      continue
    }
    await dismiss.first().click()
    await expect(page.getByText("Nothing proposed yet")).toBeVisible()
  }
  throw new Error("The companion queue would not empty.")
}

test.beforeEach(async ({ page }) => {
  await clearQueue(page)
})

async function createGoal(page: Page, title: string) {
  await page.goto("/goals")
  await page.getByRole("button", { name: "Add goal" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title").fill(title)
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(visibleCard(page, title)).toBeVisible()
}

async function deleteGoal(page: Page, title: string) {
  await page.goto("/goals")
  const card = visibleCard(page, title)
  await card.getByRole("button", { name: "Goal actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await page.getByRole("button", { name: "Delete goal" }).click()
  await expect(visibleCard(page, title)).toHaveCount(0)
}

/** Tasks survive their goal's deletion (ON DELETE set null), so clean them separately. */
async function deleteTasksMatching(page: Page, fragment: string) {
  await page.goto("/todos")
  await page.getByRole("button", { name: "All", exact: true }).click()
  for (;;) {
    const rows = visibleCard(page, fragment)
    // Counted BEFORE the delete. Reading it afterwards asserts `n === n - 1` against a
    // list that has already shrunk, which is unsatisfiable — latent while this only ever
    // removed one row, and a hang the moment a caller passed a prefix matching three.
    const before = await rows.count()
    if (before === 0) break
    await rows.first().getByRole("button", { name: "Task actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(rows).toHaveCount(before - 1)
  }
}

async function planGoal(page: Page, goalTitle: string) {
  await page.goto("/companion")
  await page.getByLabel("Goal").click()
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

  // The stub returns two milestones and two tasks.
  await expect(page.getByText("Creates 2 milestones and 2 tasks")).toBeVisible()

  // Pruning a milestone takes its task with it — the finalize step drops both, and the
  // manifest is what proves it before anything is written.
  await page
    .getByRole("checkbox", { name: "Include STUB second milestone" })
    .click()
  await expect(page.getByText("Creates 1 milestone and 1 task")).toBeVisible()

  // Editing in place: the row is an input, so there is no edit mode to enter.
  const renamed = `${goalTitle} renamed milestone`
  await page.getByLabel("Milestone 1 title").fill(renamed)

  await page.getByRole("button", { name: "Apply" }).click()

  // Applying navigates to the result, which is also the fastest way to see it landed.
  await expect(page).toHaveURL(/\/goals/)
  const card = visibleCard(page, goalTitle)
  await expect(card.getByText(renamed)).toBeVisible()
  // The excluded milestone was never created.
  await expect(card.getByText("STUB second milestone")).toHaveCount(0)
  // The surviving task is linked to the goal, so it counts toward momentum (T8).
  await expect(card.getByText("STUB task one")).toBeVisible()

  await deleteGoal(page, goalTitle)
  await deleteTasksMatching(page, "STUB task one")
})

test("a refinement replaces the proposal rather than stacking another", async ({
  page,
}) => {
  const goalTitle = `E2E refine ${Date.now()}`
  await createGoal(page, goalTitle)
  await planGoal(page, goalTitle)
  await expect(page.getByText("Creates 2 milestones and 2 tasks")).toBeVisible()

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
  await expect(page.getByText("Creates 1 milestone and 1 task")).toBeVisible()
  // Revised in place, not stacked: this goal has no SECOND proposal queued behind the
  // one on screen. Scoped to this goal's title rather than asserting the queue is empty
  // outright — the suite shares a persistent database, and a proposal abandoned by an
  // earlier failed run would make a global assertion fail for an unrelated reason.
  await expect(page.getByRole("button", { name: goalTitle })).toHaveCount(0)

  await page.getByRole("button", { name: "Discard" }).click()
  await expect(page.getByText("Nothing proposed yet")).toBeVisible()

  await deleteGoal(page, goalTitle)
})

test("a discarded proposal creates nothing and leaves the queue empty", async ({
  page,
}) => {
  const goalTitle = `E2E discard ${Date.now()}`
  await createGoal(page, goalTitle)
  await planGoal(page, goalTitle)

  await page.getByRole("button", { name: "Discard" }).click()
  await expect(page.getByText("Nothing proposed yet")).toBeVisible()

  await page.goto("/goals")
  const card = visibleCard(page, goalTitle)
  await expect(card.getByText("STUB first milestone")).toHaveCount(0)
  await expect(card.getByText("No milestones or target yet.")).toBeVisible()

  await deleteGoal(page, goalTitle)
})

/** Routine cards live on /todos/routines and delete behind a confirm. */
async function deleteRoutines(page: Page, fragment: RegExp) {
  await page.goto("/todos/routines")
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
  await page.goto("/companion")
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

  // Applying a routine lands on the routines page, not /goals.
  await expect(page).toHaveURL(/\/todos\/routines/)
  const card = visibleCard(page, "STUB morning routine")
  await expect(card).toBeVisible()
  await expect(card.getByText("STUB make coffee")).toBeVisible()
  await expect(card.getByText("STUB read something")).toHaveCount(0)

  await deleteRoutines(page, /STUB morning routine/)
})

test("a routine refinement replaces the proposal in place", async ({
  page,
}) => {
  await page.goto("/companion")
  await page.getByLabel("Routine brief").fill("a wind-down routine")
  await page.getByRole("button", { name: "Build" }).click()
  await expect(page.getByText("Proposed routine")).toBeVisible()

  await page.getByLabel("Change this routine").fill("just one step")
  await page.getByRole("button", { name: "Revise the proposal" }).click()

  await expect(page.getByLabel("Routine name")).toHaveValue(
    "STUB refined routine",
  )
  await expect(page.getByText("Creates a routine of 1 task")).toBeVisible()

  await page.getByRole("button", { name: "Discard" }).click()
  await expect(page.getByText("Nothing proposed yet")).toBeVisible()
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
  await page.goto("/todos")
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

  await page.goto("/companion")
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
  await expect(page.getByText("Nothing proposed yet")).toBeVisible()

  await deleteTasksMatching(page, prefix)
})

test("a summary refinement replaces it in place", async ({ page }) => {
  const prefix = `E2E refine week ${Date.now()}`
  await seedCompletedTasks(page, prefix, 3)

  await page.goto("/companion")
  await page.getByRole("button", { name: "Summarise this week" }).click()
  await expect(page.getByText("STUB a steady week")).toBeVisible()

  await page.getByLabel("Change this summary").fill("be blunter")
  await page.getByRole("button", { name: "Revise the proposal" }).click()

  await expect(page.getByText("STUB refined headline")).toBeVisible()
  await expect(page.getByText("STUB a steady week")).toHaveCount(0)

  await page.getByRole("button", { name: "Done" }).click()
  await expect(page.getByText("Nothing proposed yet")).toBeVisible()

  await deleteTasksMatching(page, prefix)
})

test("pasted transactions are extracted, pruned and applied", async ({
  page,
}) => {
  await page.goto("/companion")
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
})
