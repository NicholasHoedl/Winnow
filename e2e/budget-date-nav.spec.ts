import { test, expect } from "@playwright/test"

// Browser coverage for T1-S7: budget NL quick-add + jump-to-date pickers (meals day / budget month).

test("budget quick-add logs a transaction", async ({ page }) => {
  const desc = `e2etx${Date.now()}`
  await page.goto("/budget")

  const bar = page.getByLabel("Quick add transaction")
  await bar.fill(`${desc} $4`)
  await bar.press("Enter")

  const row = page.locator("div.bg-card").filter({ hasText: desc })
  await expect(row).toBeVisible()

  // The suite runs serially against the persistent dev database, so a row left here
  // accumulates on every run — inflating the month's totals that other budget specs
  // read, and eventually pushing the transaction list past a screenful.
  await row.getByRole("button", { name: "Transaction actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row).toHaveCount(0)
})

test("budget quick-add rejects unparseable input and keeps the text", async ({
  page,
}) => {
  await page.goto("/budget")
  const bar = page.getByLabel("Quick add transaction")
  await bar.fill("nothing to parse here")
  await bar.press("Enter")

  await expect(page.getByText(/parse that/i)).toBeVisible()
  await expect(bar).toHaveValue("nothing to parse here")
})

test("meals day-picker jumps to a chosen day", async ({ page }) => {
  await page.goto("/meals")
  await page.getByRole("button", { name: "Jump to a day" }).click()

  const calendar = page.locator('[data-slot="calendar"]')
  await expect(calendar).toBeVisible()
  await calendar.getByText("15", { exact: true }).click()

  await expect(page).toHaveURL(/\/meals\?date=\d{4}-\d{2}-15$/)
})

test("budget month-picker jumps to a chosen month", async ({ page }) => {
  await page.goto("/budget")
  await page.getByRole("button", { name: "Jump to a month" }).click()

  const calendar = page.locator('[data-slot="calendar"]')
  await expect(calendar).toBeVisible()
  await calendar.getByText("15", { exact: true }).click()

  await expect(page).toHaveURL(/\/budget\?month=\d{4}-\d{2}$/)
})
