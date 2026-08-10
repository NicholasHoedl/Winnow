import { test, expect, type Page } from "./_test"
import { visibleCard } from "./_card"

/**
 * Browser coverage for T12a: a habit is a quota and a log.
 *
 * A habit created today has no history — there is no way to fabricate past periods through
 * the UI — so every assertion reads the numbers straight off the card as they move. That
 * turns out to be enough, because the behaviour worth pinning is what happens as you log:
 * the streak turns over when the QUOTA is met, not when the first entry lands.
 *
 * `visibleCard` works on this page and not in the rail: the rail's entries carry
 * `data-rail` and are excluded by construction. Rail state is read through the
 * `rail-habit` testid instead.
 */

const PREFIX = "E2E habit"

/**
 * A habit, built through the dialog. Defaults are "3 × a week", which is the canonical
 * case, so only a different cadence needs arguments.
 */
async function addHabit(
  page: Page,
  title: string,
  period?: "a day" | "a week" | "a month",
  target?: number,
) {
  await page.goto("/activity/habits")
  await page.getByRole("button", { name: "New habit", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(title)
  if (target !== undefined) {
    await dialog.getByLabel("How often", { exact: true }).fill(String(target))
  }
  if (period) {
    await dialog.getByLabel("Period", { exact: true }).click()
    await page.getByRole("option", { name: period, exact: true }).click()
  }
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(visibleCard(page, title)).toHaveCount(1)
}

/**
 * Far simpler than T7c's teardown, and that is a property of the design rather than luck:
 * a habit generates no tasks, so there is no rule to stop and no orphaned instances to
 * sweep. Entries cascade with the row.
 */
test.afterEach(async ({ page }) => {
  await page.goto("/activity/habits")
  const strays = visibleCard(page, new RegExp(PREFIX))
  for (let i = 0; i < 10; i++) {
    const before = await strays.count()
    if (before === 0) break
    await strays
      .first()
      .getByRole("button", { name: new RegExp(`^${PREFIX}.* actions$`) })
      .click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await page
      .getByRole("button", { name: "Delete habit", exact: true })
      .click()
    await expect(strays).toHaveCount(before - 1)
  }
  await expect(strays).toHaveCount(0)
})

test("the streak turns over at the target, not at the first log", async ({
  page,
}) => {
  const title = `${PREFIX} classes ${Date.now()}`
  await addHabit(page, title)

  const card = () => visibleCard(page, title)
  const log = () => card().getByRole("button", { name: `Log ${title}` })

  await expect(card()).toContainText("0/3 this week")
  await expect(card()).toContainText("Streak 0")

  // The assertion this whole tranche exists for. Two of three is real progress and NOT a
  // streak — no previous Winnow primitive could express the difference, because a
  // recurring task is done or it isn't.
  await log().click()
  await expect(card()).toContainText("1/3 this week")
  await expect(card()).toContainText("Streak 0")

  await log().click()
  await expect(card()).toContainText("2/3 this week")
  await expect(card()).toContainText("Streak 0")

  await log().click()
  await expect(card()).toContainText("3/3 this week")
  await expect(card()).toContainText("Streak 1")
})

test("an overshoot is counted honestly and does not overflow the bar", async ({
  page,
}) => {
  const title = `${PREFIX} extra ${Date.now()}`
  await addHabit(page, title, "a week", 2)

  const card = () => visibleCard(page, title)
  const log = () => card().getByRole("button", { name: `Log ${title}` })

  await log().click()
  await log().click()
  await expect(card()).toContainText("2/2 this week")
  await expect(card()).toContainText("Streak 1")

  // A third session against a target of two is a true thing to have done, so `done` keeps
  // counting. The bar clamps at 100% — 150% of a progress bar is a rendering bug.
  await log().click()
  await expect(card()).toContainText("3/2 this week")
  await expect(card()).toContainText("Streak 1")
})

test("a log can be undone, and takes exactly the entry it made", async ({
  page,
}) => {
  const title = `${PREFIX} undo ${Date.now()}`
  await addHabit(page, title)

  const card = () => visibleCard(page, title)
  await card()
    .getByRole("button", { name: `Log ${title}` })
    .click()
  await expect(card()).toContainText("1/3 this week")

  // `exact`, because the fixture title contains the word "undo" and a substring match
  // would also find this habit's own "Log …" and "… actions" buttons.
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(card()).toContainText("0/3 this week")
})

test("a daily habit counts days, not weeks", async ({ page }) => {
  const title = `${PREFIX} vocab ${Date.now()}`
  await addHabit(page, title, "a day", 1)

  const card = () => visibleCard(page, title)
  // "today", not "this week" — the period is the unit, and the copy has to say which.
  await expect(card()).toContainText("0/1 today")

  await card()
    .getByRole("button", { name: `Log ${title}` })
    .click()
  await expect(card()).toContainText("1/1 today")
  await expect(card()).toContainText("Streak 1")
})

test("the rail logs the same habit the page shows", async ({ page }) => {
  const title = `${PREFIX} rail ${Date.now()}`
  await addHabit(page, title)

  await page.goto("/activity")
  const railHabit = page.getByTestId("rail-habit").filter({ hasText: title })
  await expect(railHabit).toHaveCount(1)
  await expect(railHabit).toContainText("0/3")

  await railHabit.getByRole("button", { name: `Log ${title}` }).click()
  await expect(railHabit).toContainText("1/3")

  // Same row underneath, not a second tally kept somewhere else.
  await page.goto("/activity/habits")
  await expect(visibleCard(page, title)).toContainText("1/3 this week")
})
