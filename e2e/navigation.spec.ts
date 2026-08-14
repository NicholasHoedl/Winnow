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
  // The agenda leads the page since /today was folded in; "Up next" narrowed to
  // "Tomorrow" at the same time, because the agenda already covers today.
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible()
  await expect(page.getByText("Tomorrow").first()).toBeVisible()
  await expect(page.getByLabel("Quick add a task")).toBeVisible()
  for (const label of ["Coming up", "Macros", "Budget"]) {
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

test("the merged routes redirect, and their nav entries are gone", async ({
  page,
}) => {
  // T10 (ADR-0013). Both were top-level nav entries for the whole life of the app, so
  // they are the two most likely URLs to be bookmarked or sitting in an installed shell's
  // history — a 404 here would be a dead icon on a phone this repo cannot reach.
  for (const old of ["/todos", "/goals"]) {
    await page.goto(old)
    await expect(page).toHaveURL(/\/activity$/)
  }
  await page.goto("/todos/routines")
  await expect(page).toHaveURL(/\/activity\/routines$/)
  await page.goto("/todos/habits")
  await expect(page).toHaveURL(/\/activity\/habits$/)

  // And nothing still advertises them. Scoped to the nav, because "Goals" is also the
  // rail's own heading on /activity — which is exactly where it should be instead.
  await page.goto("/")
  const nav = page.getByRole("navigation").first()
  await expect(nav.getByRole("link", { name: "To-dos" })).toHaveCount(0)
  await expect(nav.getByRole("link", { name: "Goals" })).toHaveCount(0)
  await expect(nav.getByRole("link", { name: "Activity" })).toBeVisible()
})

test("the companion has a nav tab, directly after Activity", async ({
  page,
}) => {
  // The tab is CONDITIONAL — `/companion` 404s unless AI_ENABLED is set with a provider
  // (ADR-0011), so it is spliced in at render rather than living in the static list. The
  // e2e environment configures the stub provider, so it is expected here.
  await page.goto("/")
  const nav = page.getByRole("navigation").first()
  const labels = await nav.getByRole("link").allInnerTexts()
  expect(labels).toEqual([
    "Dashboard",
    "Activity",
    "Companion",
    "Calendar",
    "Budget",
    "Meals",
    "Review",
  ])

  await nav.getByRole("link", { name: "Companion", exact: true }).click()
  await expect(page).toHaveURL(/\/companion$/)
})

test("seven tabs still fit a 375px phone without overflowing", async ({
  page,
}) => {
  // The bar is a plain flex with `flex-1` and no overflow handling, so "it fits" is a
  // measurement, not a style. T10 freed a slot and the Companion tab spends it — this is
  // the check that says the ceiling is still seven and not six.
  //
  // Removing notes did not raise that ceiling, it only changed who spends the slot:
  // Review took it, so the count is unchanged and this measurement still has to pass.
  // Anything wanting a tab from here on has to take one, not add one.
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
