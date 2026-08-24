import { test, expect } from "./_test"

import { visibleCard } from "./_card"

// Browser coverage for T5a-S6: date sections, and the Someday bucket that gives an
// undated task somewhere to live.
//
// Before this the list was flat and ordered by due date, so a task with no deadline sank
// to the bottom and was indistinguishable from one due in six months. `dueStatus` had
// always returned a distinct "none" — nothing rendered it.

// `exact` matters: the digest banner renders an h2 like "1 task and 4 events today",
// which a loose "Today" would also match.
const section = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("heading", { name, level: 2, exact: true })

/**
 * The section CONTAINING that heading — for asserting which rows landed under it.
 *
 * Scoped by the heading rather than by `filter({ hasText: name })`, which is what this was
 * and which matched far more than a date section. `hasText` is case-INSENSITIVE, and
 * `/activity` also renders `<section aria-label="Habits">` whose quota captions read
 * "today" and "this week" — so the moment a DAILY habit existed anywhere in the account,
 * "Today" resolved to two sections and every assertion here died on strict mode. It took a
 * leaked habit from another spec to expose it; the heading is what this always meant.
 */
const sectionBody = (page: import("@playwright/test").Page, name: string) =>
  page.locator("section").filter({ has: section(page, name) })

// Cleanup here, not only inline. An earlier version of this spec failed on a locator and
// left two tasks behind — end-of-body cleanup is skipped entirely when an assertion
// aborts the test, which is how the same mistake has now happened three times in this
// tranche. The prefix is per-spec so it can't remove another spec's in-flight rows.
test.afterEach(async ({ page }) => {
  await page.goto("/activity")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const strays = visibleCard(page, /E2E (someday|todayish|donesec) \d+/)
  for (let i = 0; i < 12; i++) {
    const before = await strays.count()
    if (before === 0) break
    await strays.first().getByRole("button", { name: "Task actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(strays).toHaveCount(before - 1)
    // Reload so the undo toast can't sit over the next row's action button.
    await page.reload()
    await page.getByRole("button", { name: "All", exact: true }).click()
  }
  await expect(strays).toHaveCount(0)
})

test("quick-add captures into Someday, the dialog schedules for today", async ({
  page,
}) => {
  const stamp = Date.now()
  const captured = `E2E someday ${stamp}`
  const scheduled = `E2E todayish ${stamp}`
  const row = (title: string) => visibleCard(page, title)

  await page.goto("/activity")

  // --- Quick-add: capture now, decide when later.
  const input = page.getByLabel("Quick add task")
  await input.fill(captured)
  await input.press("Enter")
  await expect(row(captured)).toHaveCount(1)

  // --- The dialog still prefills today, because opening it is deliberate scheduling.
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(scheduled)
  await dialog.getByRole("button", { name: "Create" }).click()
  await expect(row(scheduled)).toHaveCount(1)

  await expect(section(page, "Someday")).toBeVisible()
  await expect(section(page, "Today")).toBeVisible()

  // Each landed under the right heading. Asserting the section CONTAINS the row is the
  // point — both rows exist either way, so a bare visibility check would prove nothing.
  const somedaySection = sectionBody(page, "Someday")
  await expect(somedaySection).toContainText(captured)
  await expect(somedaySection).not.toContainText(scheduled)

  const todaySection = sectionBody(page, "Today")
  await expect(todaySection).toContainText(scheduled)
  await expect(todaySection).not.toContainText(captured)

  // --- Cleanup.
  for (const title of [captured, scheduled]) {
    await row(title).getByRole("button", { name: "Task actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(row(title)).toHaveCount(0)
    await page.reload()
  }
})

test("a completed task leaves the date sections for Done", async ({ page }) => {
  const title = `E2E donesec ${Date.now()}`
  const row = () => visibleCard(page, title)

  await page.goto("/activity")
  const input = page.getByLabel("Quick add task")
  await input.fill(title)
  await input.press("Enter")
  await expect(row()).toHaveCount(1)

  await row().getByLabel("Mark as done").click()
  // "Active" hides it entirely; a done task has no date section it belongs in.
  await expect(row()).toHaveCount(0)

  await page.getByRole("button", { name: "All", exact: true }).click()
  await expect(section(page, "Done")).toBeVisible()
  const doneSection = sectionBody(page, "Done")
  await expect(doneSection).toContainText(title)

  await row().getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row()).toHaveCount(0)
})
