import { test, expect } from "@playwright/test"

test("dashboard shows all four live cards", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: /good to see you/i }),
  ).toBeVisible()
  for (const card of ["Tasks", "Macros", "Budget", "Today"]) {
    await expect(page.getByText(card, { exact: true }).first()).toBeVisible()
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
