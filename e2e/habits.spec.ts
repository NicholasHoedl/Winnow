import { test, expect, type Page } from "./_test"
import { visibleCard } from "./_card"

// Browser coverage for T7c. A rule created today owns exactly one cycle in the window, so
// these read the numbers straight off the card rather than trying to fabricate history.

const PREFIX = "E2E habit"

/** A daily repeating task, whose instance the generator materializes on this render. */
async function addDailyRule(page: Page, title: string) {
  await page.goto("/activity")
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(title)
  await dialog.getByRole("combobox").filter({ hasText: "Off" }).click()
  await page.getByRole("option", { name: "Daily" }).click()
  await dialog.getByRole("button", { name: "Create" }).click()
  await expect(visibleCard(page, title)).toHaveCount(1)
}

// Rules first: a leaked one generates a task every day forever. Then the completed
// instances it left behind, which survive the rule by design (`seriesId` is set null, so
// history outlives the habit) and would otherwise pile up run after run.
test.afterEach(async ({ page }) => {
  await page.goto("/activity")
  await page.getByRole("button", { name: "Repeating tasks" }).click()
  const dialog = page.getByRole("dialog")
  const rules = dialog.getByRole("button", {
    name: new RegExp(`^Stop repeating ${PREFIX} `),
  })
  for (let i = 0; i < 10; i++) {
    const before = await rules.count()
    if (before === 0) break
    await rules.first().click()
    await page
      .getByRole("button", { name: "Stop repeating", exact: true })
      .click()
    await expect(rules).toHaveCount(before - 1)
  }
  await expect(rules).toHaveCount(0)
  await page.keyboard.press("Escape")

  await page.goto("/activity")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const strays = visibleCard(page, new RegExp(PREFIX))
  for (let i = 0; i < 10; i++) {
    const before = await strays.count()
    if (before === 0) break
    await strays.first().getByRole("button", { name: "Task actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(strays).toHaveCount(before - 1)
  }
  await expect(strays).toHaveCount(0)
})

test("completing today's cycle fills the ring and starts the streak", async ({
  page,
}) => {
  const title = `${PREFIX} stretch ${Date.now()}`
  await addDailyRule(page, title)

  // Nothing done yet. The streak is 0 rather than broken, and the one cycle the rule owes
  // is counted — this is what proves the trailing cycle is being forgiven rather than
  // ignored, since a forgiven miss still belongs in the denominator.
  await page.goto("/activity/habits")
  const card = visibleCard(page, title)
  await expect(card).toContainText("Streak 0")
  await expect(card).toContainText("0/1 done")

  await page.goto("/activity")
  await visibleCard(page, title).getByLabel("Mark as done").click()

  await page.goto("/activity/habits")
  await expect(visibleCard(page, title)).toContainText("Streak 1")
  await expect(visibleCard(page, title)).toContainText("1/1 done")
})

test("a skipped cycle counts as neither a win nor a miss", async ({ page }) => {
  const title = `${PREFIX} skipped ${Date.now()}`
  await addDailyRule(page, title)

  await visibleCard(page, title)
    .getByRole("button", { name: "Task actions" })
    .click()
  await page.getByRole("menuitem", { name: "Skip this one" }).click()
  await expect(visibleCard(page, title)).toHaveCount(0)

  // The assertion that carries this spec. If a skip were treated as a miss the card would
  // read "0/1 done"; excluding it from the denominator leaves nothing to score at all.
  await page.goto("/activity/habits")
  const card = visibleCard(page, title)
  await expect(card).toContainText("nothing due yet")
  await expect(card).not.toContainText("0/1 done")
})
