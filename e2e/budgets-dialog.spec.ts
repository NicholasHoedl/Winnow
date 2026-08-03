import { test, expect } from "./_test"

// Browser coverage for T3-S2: the budgets dialog saves a whole month in one atomic
// call, and can seed a month from the previous one.
//
// It works in far-future months against a category it creates itself, so it never
// reads or overwrites real budget data.

const MONTH_A = "2027-06"
const MONTH_B = "2027-07" // whose "last month" is MONTH_A

test("budgets save in one call and copy forward from the previous month", async ({
  page,
}) => {
  const category = `E2E budget ${Date.now()}`

  await page.goto("/budget")
  await page.getByRole("button", { name: "Manage categories" }).click()
  const categoryDialog = page.getByRole("dialog")
  await categoryDialog.getByLabel("Name").fill(category)
  await categoryDialog.getByRole("button", { name: "Add category" }).click()
  await expect(categoryDialog.getByText(category)).toBeVisible()
  await page.keyboard.press("Escape")

  // Set a budget for it in month A.
  await page.goto(`/budget?month=${MONTH_A}`)
  await page.getByRole("button", { name: "Set budgets" }).click()
  await page.getByRole("dialog").getByLabel(category).fill("123")
  await page.getByRole("button", { name: "Save budgets" }).click()
  await expect(page.getByText("Budgets saved")).toBeVisible()

  // Reopening proves it round-tripped.
  await page.getByRole("button", { name: "Set budgets" }).click()
  await expect(page.getByRole("dialog").getByLabel(category)).toHaveValue("123")
  await page.keyboard.press("Escape")

  // Month B starts empty; copying pulls month A's budget forward.
  await page.goto(`/budget?month=${MONTH_B}`)
  await page.getByRole("button", { name: "Set budgets" }).click()
  await page.getByRole("button", { name: "Copy last month" }).click()
  await expect(page.getByText(/Copied \d+ budget/)).toBeVisible()

  await page.getByRole("button", { name: "Set budgets" }).click()
  await expect(page.getByRole("dialog").getByLabel(category)).toHaveValue("123")
  await page.keyboard.press("Escape")

  // Cleanup — deleting the category cascades both budgets away with it.
  await page.getByRole("button", { name: "Manage categories" }).click()
  await page.getByRole("button", { name: `Delete ${category}` }).click()
  await page.getByRole("button", { name: "Delete category" }).click()
  await expect(page.getByText(category)).toHaveCount(0)
})
