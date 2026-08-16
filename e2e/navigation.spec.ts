import { test, expect } from "./_test"

import { visibleCard } from "./_card"

/**
 * The agenda is the one section here that is NOT unconditional: `TodayAgenda` replaces
 * itself — heading and all — with "Nothing due and nothing scheduled" when nothing is
 * overdue or due today. So this seeds a task due today rather than asserting against
 * whatever the shared dev database happens to hold.
 *
 * Not hypothetical tidying: it went red the first time this account had nothing due, and
 * the failure read as "the dashboard lost its agenda" rather than "there is nothing to put
 * in it". The other four labels render unconditionally, empty states included, so they
 * need no seed.
 */
test("dashboard shows the key sections", async ({ page }) => {
  const title = `E2E nav agenda ${Date.now()}`

  // The dialog prefills today's date; quick-add deliberately captures into Someday
  // instead (T5a-S6), which would never reach the agenda.
  await page.goto("/activity")
  await page.getByRole("button", { name: "New task" }).click()
  const seedDialog = page.getByRole("dialog")
  await seedDialog.getByLabel("Title", { exact: true }).fill(title)
  await seedDialog.getByRole("button", { name: "Create" }).click()
  await expect(visibleCard(page, title)).toBeVisible()

  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: /good to see you/i }),
  ).toBeVisible()
  // Slate leads the page. It replaced the agenda, "Coming up" and "Tomorrow", which were
  // three cards splitting one question — what has a date on it? — along an arbitrary line.
  await expect(page.getByRole("heading", { name: "Slate" })).toBeVisible()
  await expect(page.getByLabel("Quick add a task")).toBeVisible()
  // "Today" and not "Tomorrow"/"Later": this test seeds a task due TODAY and nothing else,
  // and Slate omits a band with nothing in it. Asserting on the other two would be asserting
  // on whatever data the account happens to carry — which is how four specs went red at once
  // on a sparse account, each looking like a feature had vanished.
  for (const label of ["Today", "Macros", "Budget"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
  }

  await page.goto("/activity")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const row = visibleCard(page, title)
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(visibleCard(page, title)).toHaveCount(0)
})

test("primary nav reaches every module", async ({ page }) => {
  await page.goto("/")
  const routes = [
    { label: "Activity", path: "/activity" },
    { label: "Calendar", path: "/calendar" },
    { label: "Budget", path: "/budget" },
    { label: "Meals", path: "/meals" },
    { label: "Review", path: "/review" },
  ]
  for (const { label, path } of routes) {
    await page.getByRole("link", { name: label, exact: true }).first().click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.getByRole("heading").first()).toBeVisible()
  }
})

test("the to-do routes still redirect, and To-dos has no nav entry", async ({
  page,
}) => {
  // T10 (ADR-0013). `/todos` was a top-level nav entry for the whole life of the app, so it
  // is among the most likely URLs to be bookmarked or sitting in an installed shell's
  // history — a 404 here would be a dead icon on a phone this repo cannot reach.
  //
  // **`/goals` used to be asserted here too and is now asserted NOT to redirect**, below.
  // T13 gave it a page again; leaving it in this loop would have been the test enforcing
  // the merge it was written to describe.
  await page.goto("/todos")
  await expect(page).toHaveURL(/\/activity$/)
  await page.goto("/todos/routines")
  await expect(page).toHaveURL(/\/activity\/routines$/)
  await page.goto("/todos/habits")
  await expect(page).toHaveURL(/\/activity\/habits$/)

  await page.goto("/")
  const nav = page.getByRole("navigation").first()
  await expect(nav.getByRole("link", { name: "To-dos" })).toHaveCount(0)
  await expect(nav.getByRole("link", { name: "Activity" })).toBeVisible()
})

test("/goals is a page again, not a redirect", async ({ page }) => {
  // The inverse of what this file asserted from T10 until T13. Worth its own test rather
  // than a deleted line, because the failure mode is silent and specific: the redirect
  // lived in `next.config.ts`, which resolves BEFORE the App Router, so a `goals/page.tsx`
  // underneath one renders for nobody and every assertion about it would pass against
  // `/activity` instead.
  await page.goto("/goals")
  await expect(page).toHaveURL(/\/goals$/)
  await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible()

  const nav = page.getByRole("navigation").first()
  await expect(
    nav.getByRole("link", { name: "Goals", exact: true }),
  ).toBeVisible()
})

test("goals has a nav tab, directly after Activity", async ({ page }) => {
  // The nav does not vary at all any more. `/companion` was the one destination that could
  // 404 depending on settings, so the bar had to be built conditionally around it; T13
  // dispersed its four jobs onto the pages of their artifacts and deleted it. Every page
  // here exists regardless and gates its own tool on `aiReady` internally.
  await page.goto("/")
  const nav = page.getByRole("navigation").first()
  const labels = await nav.getByRole("link").allInnerTexts()
  expect(labels).toEqual([
    "Dashboard",
    "Activity",
    "Goals",
    "Calendar",
    "Budget",
    "Meals",
    "Review",
  ])

  await expect(nav.getByRole("link", { name: "Companion" })).toHaveCount(0)
})

test("seven tabs still fit a 375px phone without overflowing", async ({
  page,
}) => {
  // The bar is a plain flex with `flex-1` and no overflow handling, so "it fits" is a
  // measurement, not a style. Every change since the bar filled has been a SWAP: T10 freed
  // a slot and Companion spent it, T13 removed Notes and Review took that one, then gave
  // Companion's slot to Goals when its page was deleted. The count has never moved, which
  // is why this measurement still has to pass. Anything wanting a tab has to take one.
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const bar = page.locator("nav").filter({ hasText: "Dashboard" }).last()
  await expect(bar.getByRole("link")).toHaveCount(7)

  const overflows = await bar.evaluate(
    (el) => el.scrollWidth > el.clientWidth + 1,
  )
  expect(overflows).toBe(false)

  // And no label has been squeezed into wrapping onto a second line, which is how this
  // fails before it starts clipping.
  const heights = await bar
    .getByRole("link")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
  expect(new Set(heights.map(Math.round)).size).toBe(1)

  const pageOverflows = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  )
  expect(pageOverflows).toBe(false)
})
