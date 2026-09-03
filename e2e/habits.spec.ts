import { test, expect, type Locator, type Page } from "./_test"
import { visibleCard } from "./_card"
import { announces, deleteHabitsMatching, meter, seedHabit } from "./_habits"

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
/** The dialog's wording for a cadence, in the column's terms. */
function periodOf(
  period?: "a day" | "a week" | "a month",
): "day" | "week" | "month" {
  if (period === "a day") return "day"
  if (period === "a month") return "month"
  return "week"
}

async function addHabit(
  page: Page,
  title: string,
  period?: "a day" | "a week" | "a month",
  target?: number,
) {
  // Seeded, not dialogued. Every test in this file is about what a quota DOES as you log
  // against it — the streak turning over, an overshoot counted honestly, an undo taking
  // exactly its own entry — and none of them is about the form that made the habit. The
  // dialog keeps its browser coverage in `activity.spec.ts` and `command-palette.spec.ts`,
  // both of which create a habit through it.
  //
  // The signature is unchanged so every call site reads as it did, and the navigation and
  // assertion stay: the tests below act on this page, and proving the row rendered is worth
  // keeping whether the row arrived through a form or through SQL.
  await seedHabit({ title, period: periodOf(period), targetCount: target })
  await page.goto("/activity/habits")
  await expect(visibleCard(page, title)).toHaveCount(1)
}

/**
 * The other kind: "20 words a day" rather than "one session a day".
 *
 * Separate from `addHabit` rather than another optional argument, because the dialog is a
 * different form once "An amount" is chosen — a different field, a different label, and a
 * `targetCount` that stops being read at all.
 */
async function addMeasuredHabit(
  page: Page,
  title: string,
  amount: number,
  unit: string,
  period: "a day" | "a week" | "a month" = "a day",
) {
  // `unit` + `targetAmount` together are what make the variant measured; `targetCount` is
  // written but never read for one (`resolveQuota` picks the amount), which is why this
  // still leaves it at the default rather than pretending to a number.
  await seedHabit({
    title,
    period: periodOf(period),
    unit,
    targetAmount: amount,
  })
  await page.goto("/activity/habits")
  await expect(visibleCard(page, title)).toHaveCount(1)
}

/**
 * Log an amount against a measured habit.
 *
 * Enter rather than the popover's own Log button, and not only because it is shorter: the
 * prompt contains a second control named "Log" beside the trigger that opened it, and
 * submitting the form is the path a person actually takes after typing one number.
 */
async function logAmount(
  page: Page,
  // The card or the chip — whichever surface's button is being tested.
  scope: Page | Locator,
  title: string,
  amount: number,
) {
  await scope.getByRole("button", { name: `Log ${title}`, exact: true }).click()
  // Found on the PAGE rather than inside `scope`: a popover renders in a portal at the
  // document root, so it is nowhere near the button that opened it in the DOM.
  const field = page.getByLabel(/^How many /)
  await field.fill(String(amount))
  await field.press("Enter")
}

/**
 * Far simpler than T7c's teardown, and that is a property of the design rather than luck:
 * a habit generates no tasks, so there is no rule to stop and no orphaned instances to
 * sweep. Entries cascade with the row.
 */
/**
 * Straight to SQL, which is simpler than the UI version AND strictly more thorough.
 *
 * That sweep had to unarchive before it could delete: an archived row carries `data-rail`,
 * so `visibleCard` cannot see it, and an archived habit has no Delete menu at all — the only
 * way out through the UI was back through Unarchive first. A `delete` does not care, so the
 * two loops, the confirm dialog and the page they needed all go. Entries cascade with the
 * row either way, which is the property that made the UI version safe and makes this one
 * safe for the same reason.
 */
test.afterEach(async () => {
  await deleteHabitsMatching(PREFIX)
})

test("the streak turns over at the target, not at the first log", async ({
  page,
}) => {
  const title = `${PREFIX} classes ${Date.now()}`
  await addHabit(page, title)

  const card = () => visibleCard(page, title)
  const log = () => card().getByRole("button", { name: `Log ${title}` })

  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(0, 3, "this week"),
  )
  await expect(card()).toContainText("Streak 0")

  // The assertion this whole tranche exists for. Two of three is real progress and NOT a
  // streak — no previous Winnow primitive could express the difference, because a
  // recurring task is done or it isn't.
  await log().click()
  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(1, 3, "this week"),
  )
  await expect(card()).toContainText("Streak 0")

  await log().click()
  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(2, 3, "this week"),
  )
  await expect(card()).toContainText("Streak 0")

  await log().click()
  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(3, 3, "this week"),
  )
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
  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(2, 2, "this week"),
  )
  await expect(card()).toContainText("Streak 1")

  // A third session against a target of two is a true thing to have done, so `done` keeps
  // counting — and the meter now GROWS to show it, a third box in the accent colour beside
  // the two it owed. It used to be a continuous bar clamped at 100%, which drew 3-of-2
  // identically to 2-of-2 and threw away the only interesting thing about the row.
  await log().click()
  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(3, 2, "this week"),
  )
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
  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(1, 3, "this week"),
  )

  // `exact`, because the fixture title contains the word "undo" and a substring match
  // would also find this habit's own "Log …" and "… actions" buttons.
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(0, 3, "this week"),
  )
})

test("a daily habit counts days, not weeks", async ({ page }) => {
  const title = `${PREFIX} vocab ${Date.now()}`
  await addHabit(page, title, "a day", 1)

  const card = () => visibleCard(page, title)
  // "today", not "this week" — the period is the unit, and the copy has to say which.
  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(0, 1, "today"),
  )

  await card()
    .getByRole("button", { name: `Log ${title}` })
    .click()
  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(1, 1, "today"),
  )
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
  await expect(meter(chip, title)).toHaveAttribute(
    "aria-valuetext",
    announces(0, 3, "this week"),
  )

  await chip.getByRole("button", { name: `Log ${title}` }).click()
  await expect(meter(chip, title)).toHaveAttribute(
    "aria-valuetext",
    announces(1, 3, "this week"),
  )

  // Same row underneath, not a second tally kept somewhere else. The strip used to carry
  // the cadence on its own line above a bare `1/3`; both surfaces state the whole thing the
  // same way now, which is what lets this compare them at all.
  await page.goto("/activity/habits")
  await expect(meter(visibleCard(page, title), title)).toHaveAttribute(
    "aria-valuetext",
    announces(1, 3, "this week"),
  )
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
  // By `data-card`, not by heading text. The card was "Habits" until T15 merged it with the
  // goals card into "Goals & practice"; an attribute says which card this is without the
  // test having an opinion about what it is called. Every dashboard card carries one now —
  // `DashboardCard` stamps it from the same key the collapse preference is stored under, so
  // the locator and the stored state cannot drift apart.
  const card = page.locator('[data-card="goals"]')
  await expect(card).toHaveCount(1)

  // The count line. A regex because how many OTHER habits this account keeps is not this
  // test's business — only that the line states the truth in the right shape.
  await expect(card).toContainText(/\d+ of \d+ short|All met/)

  // **No longer conditional on how many habits exist.** The card used to show at most
  // three rows, unmet first, so this assertion quietly assumed the account had fewer than
  // three other unmet habits. T15 removed the cap: every habit is on the card, so a habit
  // created seconds ago is always findable.
  await expect(card).toContainText(title)
  await expect(meter(card, title)).toHaveAttribute(
    "aria-valuetext",
    announces(0, 3, "this week"),
  )

  // `addHabit` attaches no goal, so this one proves the grouping too: it has to land in
  // the group for practice that serves no goal rather than under someone else's heading.
  await expect(card).toContainText("Not tied to a goal")

  await card.getByRole("button", { name: `Log ${title}` }).click()
  await expect(meter(card, title)).toHaveAttribute(
    "aria-valuetext",
    announces(1, 3, "this week"),
  )
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
  await expect(meter(visibleCard(page, title), title)).toHaveAttribute(
    "aria-valuetext",
    announces(0, 3, "this week"),
  )
})

/**
 * The measured variant, and the exact reading the old code produced.
 *
 * `adherence` counted ROWS until this shipped, so a habit carrying `targetAmount: 20` sat
 * at "1 of 1 done" after a single word — a number that looked right and was nonsense. That
 * is why `unit` and `targetAmount` were kept out of `habitInputSchema` for three tranches,
 * and it is the one behaviour worth pinning in a browser rather than only in a unit test.
 */
test("a measured habit counts what you logged, not that you logged", async ({
  page,
}) => {
  const title = `${PREFIX} words ${Date.now()}`
  await addMeasuredHabit(page, title, 20, "words")

  const card = () => visibleCard(page, title)

  // The cadence line names the amount. "Daily" would be the session habit's wording and
  // would lose the only statement on the card of what 20 refers to.
  await expect(card()).toContainText("20 words a day")
  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(0, 20, "today", "words"),
  )

  // One log of twelve is twelve, not one — and not done.
  await logAmount(page, card(), title, 12)
  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(12, 20, "today", "words"),
  )

  // A second log ADDS. Under the old maths this was the moment the habit read 2 of 1.
  await logAmount(page, card(), title, 8)
  await expect(meter(card(), title)).toHaveAttribute(
    "aria-valuetext",
    announces(20, 20, "today", "words"),
  )
})

/**
 * The cheap read has its own column list, and this is what proves it selects the new two.
 *
 * `getHabitStrip` picks columns by hand rather than taking the row — that is what lets it
 * cost four fields instead of thirteen. Leaving `targetAmount` and `unit` out of that list
 * would not have failed anywhere: the strip would simply have shown every measured habit
 * as though its target were one session, on the surface most used from a phone.
 */
test("the strip shows a measured habit in its own units", async ({ page }) => {
  const title = `${PREFIX} pages ${Date.now()}`
  await addMeasuredHabit(page, title, 30, "pages")

  await page.goto("/activity")
  const chip = page.getByTestId("habit-chip").filter({ hasText: title })
  await expect(chip).toHaveCount(1)
  await expect(meter(chip, title)).toHaveAttribute(
    "aria-valuetext",
    announces(0, 30, "today", "pages"),
  )

  // And it is loggable from here, which is the whole reason the strip exists.
  await logAmount(page, chip, title, 12.5)
  await expect(meter(chip, title)).toHaveAttribute(
    "aria-valuetext",
    announces(12.5, 30, "today", "pages"),
  )
})
