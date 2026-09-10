import { test, expect, type Page } from "./_test"

// Browser coverage for T3-S2 and T24, on the page they moved to in T30: the Budgets page
// saves a whole month in one atomic call and can seed a month from the previous one; the
// month's total is a standing figure; the dashboard measures the month against it.
//
// It works in far-future months against a category it creates itself, so it never reads
// or overwrites real budget data. `budgets-dialog.spec.ts` until T30 — the same cases,
// driven through the "Set budgets" dialog behind the ⋮ menu that ADR-0024 replaced.

const MONTH_A = "2027-06"
const MONTH_B = "2027-07" // whose "last month" is MONTH_A

const total = (page: Page) => page.getByLabel("Total for the month")

async function save(page: Page) {
  await page.getByRole("button", { name: "Save budgets" }).click()
  await expect(page.getByText("Budgets saved")).toBeVisible()
}

test("budgets save in one call and copy forward from the previous month", async ({
  page,
}) => {
  const category = `E2E budget ${Date.now()}`

  await page.goto("/budget/categories")
  await page.getByLabel("Name").fill(category)
  await page.getByRole("button", { name: "Add category" }).click()
  await expect(page.getByText("Category added")).toBeVisible()
  await expect(page.getByText(category, { exact: true })).toBeVisible()

  // Set a budget for it in month A.
  await page.goto(`/budget/budgets?month=${MONTH_A}`)
  await page.getByLabel(category).fill("123")
  await save(page)

  // A reload proves it round-tripped.
  await page.reload()
  await expect(page.getByLabel(category)).toHaveValue("123")

  // Month B starts empty; copying pulls month A's budget forward, and the form re-seeds
  // itself from the copied figures without a reload — what the dialog did by closing.
  await page.goto(`/budget/budgets?month=${MONTH_B}`)
  await expect(page.getByLabel(category)).toHaveValue("")
  await page.getByRole("button", { name: "Copy last month" }).click()
  await expect(page.getByText(/Copied \d+ budget/)).toBeVisible()
  await expect(page.getByLabel(category)).toHaveValue("123")

  // Cleanup — deleting the category cascades both budgets away with it.
  await page.goto("/budget/categories")
  await page.getByRole("button", { name: `Delete ${category}` }).click()
  await page.getByRole("button", { name: "Delete category" }).click()
  await expect(page.getByText(category, { exact: true })).toHaveCount(0)
})

// The total is a STANDING figure — set once, it holds for every later month until it is
// changed — so this walks two months to prove both halves: month B inherits month A's
// total without being told, and changing B leaves A as it was. The figure is read off the
// ledger, whose stat is what the month is measured against.
test("a total for the month stands until it is changed", async ({ page }) => {
  await page.goto(`/budget/budgets?month=${MONTH_A}`)
  await total(page).fill("1500")
  await save(page)

  // Nothing is spent in a far-future month, so all of it is left.
  await page.goto(`/budget?month=${MONTH_A}`)
  await expect(page.getByText("$1,500.00", { exact: true })).toBeVisible()
  await expect(page.getByText("$1,500.00 left")).toBeVisible()

  // Month B has it too, with nothing set there.
  await page.goto(`/budget?month=${MONTH_B}`)
  await expect(page.getByText("$1,500.00", { exact: true })).toBeVisible()
  await page.goto(`/budget/budgets?month=${MONTH_B}`)
  await expect(total(page)).toHaveValue("1500")

  // Changing B starts a new figure from B on…
  await total(page).fill("2000")
  await save(page)
  await page.goto(`/budget?month=${MONTH_B}`)
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
    await page.goto(`/budget/budgets?month=${month}`)
    await total(page).fill("")
    await save(page)
    await page.goto(`/budget?month=${month}`)
    await expect(page.getByText(figure, { exact: true })).toHaveCount(0)
  }
})

// The dashboard's Budget card reads the same `totalBudgetedCents` the ledger does, so a
// total set for THIS month is what it measures the month against. This month rather than
// a far-future one, because the dashboard has no month picker — and restored afterwards
// whatever happens, since a total stands for every later month and other specs read
// this one.
test("the dashboard measures the month against the total", async ({ page }) => {
  await page.goto("/budget/budgets")
  const before = await total(page).inputValue()
  await total(page).fill("4321")
  await save(page)

  try {
    await page.goto("/")
    await expect(page.getByText("of $4,321.00")).toBeVisible()
  } finally {
    await page.goto("/budget/budgets")
    await total(page).fill(before)
    await save(page)
  }
})
