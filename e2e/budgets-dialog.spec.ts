import { test, expect } from "./_test"

import { pageAction } from "./_menu"

// Browser coverage for T3-S2: the budgets dialog saves a whole month in one atomic
// call, and can seed a month from the previous one. T24 added the month's total to the
// same dialog, and the two specs after the first cover it.
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
  await pageAction(page, "Manage categories")
  const categoryDialog = page.getByRole("dialog")
  await categoryDialog.getByLabel("Name").fill(category)
  await categoryDialog.getByRole("button", { name: "Add category" }).click()
  await expect(categoryDialog.getByText(category)).toBeVisible()
  await page.keyboard.press("Escape")

  // Set a budget for it in month A.
  await page.goto(`/budget?month=${MONTH_A}`)
  await pageAction(page, "Set budgets")
  await page.getByRole("dialog").getByLabel(category).fill("123")
  await page.getByRole("button", { name: "Save budgets" }).click()
  await expect(page.getByText("Budgets saved")).toBeVisible()

  // Reopening proves it round-tripped.
  await pageAction(page, "Set budgets")
  await expect(page.getByRole("dialog").getByLabel(category)).toHaveValue("123")
  await page.keyboard.press("Escape")

  // Month B starts empty; copying pulls month A's budget forward.
  await page.goto(`/budget?month=${MONTH_B}`)
  await pageAction(page, "Set budgets")
  await page.getByRole("button", { name: "Copy last month" }).click()
  await expect(page.getByText(/Copied \d+ budget/)).toBeVisible()

  await pageAction(page, "Set budgets")
  await expect(page.getByRole("dialog").getByLabel(category)).toHaveValue("123")
  await page.keyboard.press("Escape")

  // Cleanup — deleting the category cascades both budgets away with it.
  await pageAction(page, "Manage categories")
  await page.getByRole("button", { name: `Delete ${category}` }).click()
  await page.getByRole("button", { name: "Delete category" }).click()
  await expect(page.getByText(category)).toHaveCount(0)
})

// The total is a STANDING figure — set once, it holds for every later month until it is
// changed — so this walks two months to prove both halves: month B inherits month A's
// total without being told, and changing B leaves A as it was.
test("a total for the month stands until it is changed", async ({ page }) => {
  const total = () => page.getByRole("dialog").getByLabel("Total for the month")
  const save = async () => {
    await page.getByRole("button", { name: "Save budgets" }).click()
    await expect(page.getByText("Budgets saved")).toBeVisible()
  }

  await page.goto(`/budget?month=${MONTH_A}`)
  await pageAction(page, "Set budgets")
  await total().fill("1500")
  await save()

  // The page measures the month against it: the figure, and what is left of it. Nothing
  // is spent in a far-future month, so all of it is.
  await expect(page.getByText("$1,500.00", { exact: true })).toBeVisible()
  await expect(page.getByText("$1,500.00 left")).toBeVisible()

  // Month B has it too, with nothing set there.
  await page.goto(`/budget?month=${MONTH_B}`)
  await expect(page.getByText("$1,500.00", { exact: true })).toBeVisible()
  await pageAction(page, "Set budgets")
  await expect(total()).toHaveValue("1500")

  // Changing B starts a new figure from B on…
  await total().fill("2000")
  await save()
  await expect(page.getByText("$2,000.00", { exact: true })).toBeVisible()

  // …and A keeps the one it had.
  await page.goto(`/budget?month=${MONTH_A}`)
  await expect(page.getByText("$1,500.00", { exact: true })).toBeVisible()

  // Clearing is a 0 from that month on, and the stat goes with it — in each month, since
  // clearing A does not reach past B's own row.
  for (const [month, figure] of [
    [MONTH_A, "$1,500.00"],
    [MONTH_B, "$2,000.00"],
  ]) {
    await page.goto(`/budget?month=${month}`)
    await pageAction(page, "Set budgets")
    await total().fill("")
    await save()
    await expect(page.getByText(figure, { exact: true })).toHaveCount(0)
  }
})

// The dashboard's Budget card reads the same `totalBudgetedCents` the page does, so a
// total set for THIS month is what it measures the month against. This month rather than
// a far-future one, because the dashboard has no month picker — and restored afterwards
// whatever happens, since a total stands for every later month and other specs read
// this one.
test("the dashboard measures the month against the total", async ({ page }) => {
  const total = () => page.getByRole("dialog").getByLabel("Total for the month")
  const save = async () => {
    await page.getByRole("button", { name: "Save budgets" }).click()
    await expect(page.getByText("Budgets saved")).toBeVisible()
  }

  await page.goto("/budget")
  await pageAction(page, "Set budgets")
  const before = await total().inputValue()
  await total().fill("4321")
  await save()

  try {
    await page.goto("/")
    await expect(page.getByText("of $4,321.00")).toBeVisible()
  } finally {
    await page.goto("/budget")
    await pageAction(page, "Set budgets")
    await total().fill(before)
    await save()
  }
})
