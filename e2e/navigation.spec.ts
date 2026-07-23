import { test, expect } from "@playwright/test"

test("dashboard shows the key sections", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: /good to see you/i }),
  ).toBeVisible()
  await expect(page.getByText("Up next").first()).toBeVisible()
  await expect(page.getByText("Today's schedule").first()).toBeVisible()
  for (const label of ["Tasks", "Macros", "Budget"]) {
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
