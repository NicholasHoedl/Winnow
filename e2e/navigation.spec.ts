import { test, expect } from "./_test"

test("dashboard shows the key sections", async ({ page }) => {
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
})

test("primary nav reaches every module", async ({ page }) => {
  await page.goto("/")
  const routes = [
    { label: "Activity", path: "/activity" },
    { label: "Calendar", path: "/calendar" },
    { label: "Budget", path: "/budget" },
    { label: "Meals", path: "/meals" },
    { label: "Notes", path: "/notes" },
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
