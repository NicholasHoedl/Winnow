import { test, expect } from "./_test"

import { goalCard } from "./_card"

// Browser coverage for T5a-S9: numeric progress for a goal that isn't broken into
// milestones, and the target-date urgency indicator.
//
// Before this, `goalProgress` counted milestones and nothing else, so a goal with none came
// back {done:0,total:0,percent:0} — which the goals page hid but the dashboard rail
// dutifully rendered as a literal "0/0" beside a 2%-wide bar. The discriminated result
// makes "nothing to measure" a case the UI has to handle rather than a zero it can print.
//
// T10 split a goal across two surfaces, so this spec now checks each for what it is
// responsible for: the rail card carries the compact figure, and the detail dialog carries
// the wording — the unit, the target date, and "nothing to measure".

const detail = (page: import("@playwright/test").Page) =>
  page.getByRole("dialog")

async function openDetail(
  page: import("@playwright/test").Page,
  title: string,
) {
  await goalCard(page, title)
    .getByRole("button", { name: `Open ${title}` })
    .click()
  await expect(detail(page)).toBeVisible()
}

async function closeDetail(page: import("@playwright/test").Page) {
  await page.keyboard.press("Escape")
  await expect(detail(page)).toHaveCount(0)
}

/** Create a goal through the dialog; every field is optional except the title. */
async function addGoal(
  page: import("@playwright/test").Page,
  fields: {
    title: string
    current?: string
    target?: string
    unit?: string
    targetDate?: string
  },
) {
  // One button at every state now — see `_goals.ts`. The rail had two ("Add a goal" at
  // zero, a `+` labelled "Add goal" thereafter) and matching one silently required a goal
  // to already exist.
  await page.getByRole("button", { name: "New goal" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(fields.title)
  if (fields.current) await dialog.getByLabel("Current").fill(fields.current)
  if (fields.target)
    await dialog.getByLabel("Target", { exact: true }).fill(fields.target)
  if (fields.unit) await dialog.getByLabel("Unit").fill(fields.unit)
  if (fields.targetDate) {
    await dialog.getByLabel("Target date (optional)").fill(fields.targetDate)
  }
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(goalCard(page, fields.title)).toHaveCount(1)
}

test.afterEach(async ({ page }) => {
  await page.goto("/goals")
  const strays = goalCard(page, "E2E goal ")
  for (let i = 0; i < 10; i++) {
    const before = await strays.count()
    if (before === 0) break
    await strays
      .first()
      .getByRole("button", { name: /^Open / })
      .click()
    await page.getByRole("button", { name: "Delete", exact: true }).click()
    await page.getByRole("button", { name: "Delete goal" }).click()
    await expect(strays).toHaveCount(before - 1)
  }
  await expect(strays).toHaveCount(0)
})

test("a goal can be measured numerically instead of by milestones", async ({
  page,
}) => {
  const title = `E2E goal numeric ${Date.now()}`
  await page.goto("/goals")
  await addGoal(page, { title, current: "12", target: "30", unit: "books" })

  // The rail is the glanceable surface: the figure without the unit, which would not fit.
  await expect(goalCard(page, title)).toContainText("12/30")

  // The unit lives where there is room to print it.
  await openDetail(page, title)
  await expect(detail(page)).toContainText("12 / 30 books")
  await expect(detail(page)).not.toContainText("No milestones or target")
  await closeDetail(page)

  await page.reload()
  await expect(goalCard(page, title)).toContainText("12/30")
})

test("a goal with neither milestones nor a target says so, on both surfaces", async ({
  page,
}) => {
  const title = `E2E goal untracked ${Date.now()}`
  await page.goto("/goals")
  await addGoal(page, { title })

  // Not "0/0", and no progress bar pretending there is something to show.
  await openDetail(page, title)
  await expect(detail(page)).toContainText("No milestones or target yet")
  await closeDetail(page)

  // **This assertion used to be made against the DASHBOARD**, which is the surface that got
  // it wrong for four tranches — a goal with nothing to measure reported "0/0" and drew a
  // bar at 0%. The dashboard shows no goal progress at all now: its practice card groups
  // habits by cadence and names the goal on the row, so there is no bar left there to be
  // wrong. The bug is real and recurring, so the check moves to the surface that still
  // draws one rather than being deleted with the card.
  //
  // Asserted POSITIVELY. A bare `not.toContainText("0/0")` would also pass if the goal had
  // never rendered at all, which is exactly how a check like this goes quietly vacuous.
  // Asserted POSITIVELY first. A bare `not.toContainText("0/0")` would also pass if the
  // goal had never rendered at all, which is exactly how a check like this goes vacuous —
  // and it nearly did here, because the two surfaces word this differently. The dashboard
  // said "Not tracked" in so many words; `goal-card.tsx` renders NOTHING for a goal with
  // nothing to measure, so the thing to assert is the absence of a figure on a card that
  // is demonstrably present.
  const card = goalCard(page, title)
  await expect(card).toBeVisible()
  await expect(card).not.toContainText("0/0")
  await expect(card).not.toContainText("%")
})

test("a target date in the past reads as at risk, unless the goal is done", async ({
  page,
}) => {
  const stamp = Date.now()
  const late = `E2E goal late ${stamp}`
  const finished = `E2E goal finished ${stamp}`
  const past = "2020-01-15"

  await page.goto("/goals")
  await addGoal(page, {
    title: late,
    current: "1",
    target: "10",
    targetDate: past,
  })
  await openDetail(page, late)
  await expect(detail(page)).toContainText("Past target")
  await closeDetail(page)

  // Hitting the target retires the warning — a goal at 100% is finished, not late, and
  // nagging about something you completed is worse than saying nothing.
  await addGoal(page, {
    title: finished,
    current: "10",
    target: "10",
    targetDate: past,
  })
  await openDetail(page, finished)
  await expect(detail(page)).not.toContainText("Past target")
  // T44 (Pass 10): and it says which state it IS in. The dialog read "Target <date>" at
  // 10 of 10 — the same line a goal that has not started carries — so the one reading
  // worth having was the only one not made.
  await expect(detail(page)).toContainText("Target reached")
  await closeDetail(page)

  // The card says it too, in place of the momentum word: at target there is nothing left
  // to be moving towards.
  const card = goalCard(page, finished)
  await expect(card.getByText("Target reached")).toBeVisible()
  await expect(card.getByText("Moving")).toHaveCount(0)
})

/**
 * T38 (Pass 4, proximity): a field sits nearer its own label than its neighbour.
 *
 * The three-up number grid used a 12px gap while a label sits 8px above its control, so the
 * distance to the unrelated field beside it was near enough the distance to the label that
 * owns it — which is the one comparison proximity is made of. The same 12px grid was in the
 * micronutrient fields, the food editor and the routine item dialog; this measures the one
 * that is easiest to open.
 *
 * Nothing is saved: the dialog is opened and dismissed.
 */
test("the goal form's number fields sit closer to their labels than to each other", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto("/goals")
  await page.getByRole("button", { name: "New goal" }).click()

  const dialog = page.getByRole("dialog")
  const current = (await dialog.getByLabel("Current").boundingBox())!
  const target = (await dialog
    .getByLabel("Target", { exact: true })
    .boundingBox())!
  const label = (await dialog.locator('label[for="g-current"]').boundingBox())!

  // A tolerance, not an exact 16: the three `minmax(0,1fr)` tracks are fractional, so the
  // gap lands either side of any round number. 14 is still well clear of the 12 it replaced.
  const between = target.x - (current.x + current.width)
  const toLabel = current.y - (label.y + label.height)
  expect(
    between,
    `between the fields (${between.toFixed(2)}px) vs label to control (${toLabel.toFixed(2)}px)`,
  ).toBeGreaterThanOrEqual(14)
  expect(
    between,
    `between the fields (${between.toFixed(2)}px) vs label to control (${toLabel.toFixed(2)}px)`,
  ).toBeGreaterThan(toLabel)

  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
})

/**
 * T38 (Pass 4, uniform connectedness): the New goal dialog decides in its footer.
 *
 * Its Cancel and Add were a small right-aligned pair at the end of the fields, inside the
 * scrolling body — part of the form rather than the dialog's own decision, and the only
 * create dialog in the app shaped that way. They sit on the footer strip now, in the shape
 * the task, transaction and routine item dialogs use.
 */
test("the New goal dialog's actions stack full width on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto("/goals")
  await page.getByRole("button", { name: "New goal" }).click()

  const dialog = page.getByRole("dialog")
  const add = dialog.getByRole("button", { name: "Add", exact: true })
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true })
  const addBox = (await add.boundingBox())!
  const cancelBox = (await cancel.boundingBox())!

  expect(Math.round(addBox.width), "Add's width").toBeGreaterThanOrEqual(300)
  expect(Math.round(cancelBox.width), "Cancel's width").toBeGreaterThanOrEqual(
    300,
  )
  expect(
    Math.round(addBox.y + addBox.height),
    "Add sits above Cancel",
  ).toBeLessThanOrEqual(Math.round(cancelBox.y))

  await cancel.click()
  await expect(dialog).toHaveCount(0)
})
