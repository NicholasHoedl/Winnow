import { test, expect } from "@playwright/test"

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
    { label: "To-dos", path: "/todos" },
    { label: "Calendar", path: "/calendar" },
    { label: "Budget", path: "/budget" },
    { label: "Meals", path: "/meals" },
  ]
  for (const { label, path } of routes) {
    await page.getByRole("link", { name: label, exact: true }).first().click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.getByRole("heading").first()).toBeVisible()
  }
})
