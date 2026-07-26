import { test, expect } from "@playwright/test"

// Browser coverage for T4-S5. The invariant worth protecting: a blank micronutrient
// field means "no figure for this", NOT zero. The day's total therefore counts only the
// entries that carried one, and says how many did — "412mg (1 of 2)" is a usable number
// where a bare "412mg" would imply the whole day was measured.
//
// Runs on a PER-RUN past date. The "n of m" counts depend on the day being empty, so a
// fixed date is not enough: any run that fails mid-test leaves its entries behind and
// every later run then counts them ("Fiber 9g (3 of 5)" instead of "3g"). Deriving the
// day from the clock gives each run a day of its own without needing DB access.
const DAY = new Date(Date.UTC(2015, 0, 1) + (Date.now() % 4000) * 86_400_000)
  .toISOString()
  .slice(0, 10)

test("micronutrients are optional, and the day's total says how many entries had one", async ({
  page,
}) => {
  const stamp = Date.now()
  const withMicros = `e2emicroA${stamp}`
  const without = `e2emicroB${stamp}`
  const row = (name: string) =>
    page.locator("div.bg-card").filter({ hasText: name })

  await page.goto(`/meals?date=${DAY}`)

  // Locators are unscoped, matching the other meals specs: a closed dialog unmounts, so
  // only the open one's fields are in the tree even though three are declared.

  // --- Entry 1: fiber and sodium filled in, sugar and sat-fat left blank.
  await page.getByRole("button", { name: "Log food" }).click()
  await page.getByLabel("Food", { exact: true }).fill(withMicros)
  await page.getByLabel("Serving", { exact: true }).fill("1 bowl")
  await page.getByLabel("Calories", { exact: true }).fill("100")

  // The extra fields are collapsed by default — that's the point of the <details>.
  await page.getByText("More nutrition (optional)").click()
  await page.getByLabel("Fiber (g)").fill("3")
  await page.getByLabel("Sodium (mg)").fill("200")
  // Don't grow the library; this spec is about entries.
  await page.getByRole("checkbox", { name: /save as a new food/i }).uncheck()
  await page.getByRole("button", { name: "Log", exact: true }).click()
  await expect(row(withMicros)).toBeVisible()

  // With one entry, every figure came from it — no qualifier.
  const summary = page.locator("div.rounded-xl.border").first()
  await expect(summary).toContainText("Fiber")
  await expect(summary).toContainText("3g")
  await expect(summary).toContainText("200mg")
  await expect(summary).not.toContainText("of 1")
  // Sugar and sat-fat were left blank, so they aren't claimed at all.
  await expect(summary).not.toContainText("Sugar")
  await expect(summary).not.toContainText("Sat. fat")

  // --- Entry 2: no micronutrients at all.
  await page.getByRole("button", { name: "Log food" }).click()
  await page.getByLabel("Food", { exact: true }).fill(without)
  await page.getByLabel("Serving", { exact: true }).fill("1 slice")
  await page.getByLabel("Calories", { exact: true }).fill("50")
  await page.getByRole("checkbox", { name: /save as a new food/i }).uncheck()
  await page.getByRole("button", { name: "Log", exact: true }).click()
  await expect(row(without)).toBeVisible()

  // Now the totals are partial and must say so rather than implying a measured day.
  await expect(summary).toContainText("1 of 2")
  await expect(summary).toContainText("3g")

  // Cleanup. Each delete raises an undo toast in the bottom-right, which sits directly
  // over the next entry row's actions button and swallows the click — reloading between
  // deletes clears it deterministically, rather than waiting out the toast's lifetime.
  for (const name of [withMicros, without]) {
    await row(name).getByRole("button", { name: "Entry actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(row(name)).toHaveCount(0)
    await page.reload()
  }
})
