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
  await page.getByRole("button", { name: "Add goal" }).click()
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
  await page.goto("/activity")
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
  await page.goto("/activity")
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
  await page.goto("/activity")
  await addGoal(page, { title })

  // Not "0/0", and no progress bar pretending there is something to show.
  await openDetail(page, title)
  await expect(detail(page)).toContainText("No milestones or target yet")
  await closeDetail(page)

  // The dashboard rail is the surface that got this wrong for four tranches. Asserted
  // POSITIVELY — a bare `not.toContainText("0/0")` would also pass if the goal never made
  // it onto the rail at all (it shows only the first four).
  await page.goto("/")
  const rail = page.locator("div").filter({ hasText: title }).last()
  await expect(rail).toContainText("Not tracked")
  await expect(rail).not.toContainText("0/0")
})

test("a target date in the past reads as at risk, unless the goal is done", async ({
  page,
}) => {
  const stamp = Date.now()
  const late = `E2E goal late ${stamp}`
  const finished = `E2E goal finished ${stamp}`
  const past = "2020-01-15"

  await page.goto("/activity")
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
  await expect(detail(page)).toContainText("Target")
  await closeDetail(page)
})
