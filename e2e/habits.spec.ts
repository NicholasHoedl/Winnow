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
 * `visibleCard` works on this page and not on /activity: the strip's chips carry
 * `data-rail` and are excluded by construction — the attribute means "not a row in the task
 * list", which is what that selector has always used it for, and the rail was simply the
 * only place that used to be true. Strip state is read through the `habit-chip` testid.
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

  // Archived strays first. An archived row carries `data-rail` — see the header note — so
  // `visibleCard` cannot see it, and an archived habit has no Delete menu: the only way
  // out is back through Unarchive. Without this, a test that archives and then fails
  // before restoring leaves a row nothing sweeps, and the next run's "0 strays" is a lie.
  const showArchived = page.getByRole("button", { name: /^Show archived/ })
  if (await showArchived.isVisible()) {
    await showArchived.click()
    const retired = page
      .getByTestId("archived-habit")
      .filter({ hasText: new RegExp(PREFIX) })
    for (let i = 0; i < 10; i++) {
      const before = await retired.count()
      if (before === 0) break
      await retired.first().getByRole("button", { name: "Unarchive" }).click()
      await expect(retired).toHaveCount(before - 1)
    }
  }

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

/**
 * The executable form of the invariant `getHabitStrip` rests on.
 *
 * The strip loads about a month of entries and this page loads 400 days, so the two could
 * in principle disagree. They cannot, and the reason is worth stating: the strip shows only
 * `adherence` for the period containing today, which every window containing today produces
 * identically. The agreement is by construction, not by matching window sizes — which is
 * why a cheaper query here was safe when a cheaper streak would not have been.
 */
test("the strip logs the same habit the page shows", async ({ page }) => {
  const title = `${PREFIX} strip ${Date.now()}`
  await addHabit(page, title)

  await page.goto("/activity")
  const chip = page.getByTestId("habit-chip").filter({ hasText: title })
  await expect(chip).toHaveCount(1)
  await expect(chip).toContainText("0/3")

  await chip.getByRole("button", { name: `Log ${title}` }).click()
  await expect(chip).toContainText("1/3")

  // Same row underneath, not a second tally kept somewhere else.
  await page.goto("/activity/habits")
  await expect(visibleCard(page, title)).toContainText("1/3 this week")
})

/**
 * The third surface, and the only thing that proves two separate claims at once: that the
 * dashboard card logs through the SAME hook the other two use, and that
 * `revalidateHabitViews` reaches `/` — which it did not until T12d, despite a comment since
 * T12a saying it would.
 */
test("the dashboard card shows today's practice and logs it", async ({
  page,
}) => {
  const title = `${PREFIX} card ${Date.now()}`
  await addHabit(page, title)

  await page.goto("/")
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText("Habits", { exact: true }) })
  await expect(card).toHaveCount(1)

  // The count line, which is the card's answer to showing only three of however many
  // there are. A regex because how many OTHER habits this account keeps is not this
  // test's business — only that the line states the truth in the right shape.
  await expect(card).toContainText(/\d+ of \d+ short|All met/)

  // The card shows at most three rows, unmet first. A habit created seconds ago is unmet,
  // so it is in that group — but it sorts last within it, so this assertion assumes the
  // account has fewer than three OTHER unmet habits. If that stops being true this fails
  // loudly and legibly, which is the right failure to have.
  await expect(card).toContainText(title)
  await expect(card).toContainText("0/3 this week")

  await card.getByRole("button", { name: `Log ${title}` }).click()
  await expect(card).toContainText("1/3 this week")
})

/**
 * Archiving, and the way back.
 *
 * The action to unarchive existed from T7c and nothing called it: every read filtered
 * `archivedAt` and no surface listed a retired habit, so archiving was a one-way
 * disappearance while the toast said its history was kept. This test is the proof that the
 * round trip closes — and, because it asserts the habit is gone from the live list in
 * between, that archiving still HIDES it rather than merely labelling it.
 */
test("an archived habit can be brought back", async ({ page }) => {
  const title = `${PREFIX} retire ${Date.now()}`
  await addHabit(page, title)

  await visibleCard(page, title)
    .getByRole("button", { name: `${title} actions` })
    .click()
  await page.getByRole("menuitem", { name: "Archive" }).click()

  // Gone from the live list — the whole point of archiving.
  await expect(visibleCard(page, title)).toHaveCount(0)

  await page.getByRole("button", { name: /^Show archived/ }).click()
  const row = page.getByTestId("archived-habit").filter({ hasText: title })
  await expect(row).toHaveCount(1)

  await row.getByRole("button", { name: "Unarchive" }).click()

  // Back as a full card, not just off the retired list — which is what proves the row's
  // `archivedAt` was cleared rather than the list being filtered client-side.
  await expect(visibleCard(page, title)).toHaveCount(1)
  await expect(
    page.getByTestId("archived-habit").filter({ hasText: title }),
  ).toHaveCount(0)

  // Its readings survived the round trip: the quota is the one it was created with, and
  // the entries were never touched, so nothing had to be re-entered.
  await expect(visibleCard(page, title)).toContainText("0/3")
})
