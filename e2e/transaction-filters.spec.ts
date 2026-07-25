import { test, expect } from "@playwright/test"

// Browser coverage for T3-S4. The headline invariant: filtering narrows the LIST but
// must not move the month's Income/Expenses/Net, which are read separately and always
// describe the whole month. Deriving them from the rendered rows would silently report
// the filtered subset instead — the exact bug T3-S1 pre-empted.

test("filtering narrows the list but not the month's totals", async ({
  page,
}) => {
  const stamp = Date.now()
  const alpha = `E2E Alpha ${stamp}`
  const beta = `E2E Beta ${stamp}`
  const row = (payee: string) =>
    page.locator("div.bg-card").filter({ hasText: payee })

  await page.goto("/budget")
  for (const [payee, amount] of [
    [alpha, "11"],
    [beta, "22"],
  ] as const) {
    await page.getByRole("button", { name: "Add", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Amount", { exact: false }).fill(amount)
    await dialog.getByLabel("Payee").fill(payee)
    await dialog.getByRole("button", { name: "Add", exact: true }).click()
    await dialog.waitFor({ state: "hidden" })
  }
  await expect(row(alpha)).toBeVisible()
  await expect(row(beta)).toBeVisible()

  const stats = page.locator(".grid.grid-cols-3.rounded-xl").first()
  const totalsBefore = await stats.innerText()

  // Narrow to just one of them.
  await page.getByLabel("Search transactions").fill(alpha)
  await expect(row(beta)).toHaveCount(0)
  await expect(row(alpha)).toBeVisible()
  await expect(page.getByText(/Filtered — \d+ shown/)).toBeVisible()

  // ...and the month's totals are untouched.
  expect(await stats.innerText()).toBe(totalsBefore)

  await page.getByRole("button", { name: "Clear" }).click()
  await expect(row(beta)).toBeVisible()

  // Sorting is server-side and stable; smallest-first puts the £11 row ahead.
  await page.getByLabel("Sort transactions").click()
  await page.getByRole("option", { name: "Smallest first" }).click()
  await expect(page).toHaveURL(/sort=amount/)
  await expect(row(alpha)).toBeVisible()

  for (const payee of [alpha, beta]) {
    await row(payee).getByRole("button", { name: "Transaction actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(row(payee)).toHaveCount(0)
  }
})
