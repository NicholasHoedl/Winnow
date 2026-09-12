import { test, expect } from "./_test"

import { visibleCard } from "./_card"
import { deleteTransactionsMatching } from "./_transactions"

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
  const row = (payee: string) => visibleCard(page, payee)

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
    await row(payee)
      .getByRole("button", { name: "Transaction actions" })
      .click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(row(payee)).toHaveCount(0)
  }
})

/**
 * T36 (Tesler): a payee filed once files itself the next time.
 *
 * The dialog fills the category — and the type that category belongs to — when the payee
 * loses focus and nothing has been chosen yet, so the second shop at the same shop is an
 * amount and a name. In a browser rather than in `transaction-dialog.test.tsx` because
 * what is only true here is the round trip: the memory is read on the SERVER from rows
 * this journey wrote, so it also proves the query sees them.
 *
 * Works against a category it creates itself, and deletes both halves afterwards.
 */
test("the dialog files a known payee under the category it carried last time", async ({
  page,
}) => {
  const stamp = Date.now()
  const category = `E2E Memory ${stamp}`
  const payee = `E2E Shop ${stamp}`
  const dialog = page.getByRole("dialog")

  await page.goto("/budget/categories")
  await page.getByLabel("Name").fill(category)
  await page.getByRole("button", { name: "Add category" }).click()
  await expect(page.getByText("Category added")).toBeVisible()

  try {
    // The transaction that teaches it.
    await page.goto("/budget")
    await page.getByRole("button", { name: "Add", exact: true }).click()
    await dialog.getByLabel("Amount", { exact: false }).fill("12")
    await dialog.getByLabel("Payee").fill(payee)
    await dialog.getByLabel("Category").click()
    await page.getByRole("option", { name: category }).click()
    await dialog.getByRole("button", { name: "Add", exact: true }).click()
    await dialog.waitFor({ state: "hidden" })
    await expect(visibleCard(page, payee)).toBeVisible()

    // The next one, typed in a different case: Tab out of the payee and the category is
    // already answered.
    await page.getByRole("button", { name: "Add", exact: true }).click()
    await dialog.getByLabel("Amount", { exact: false }).fill("13")
    await dialog.getByLabel("Payee").fill(payee.toUpperCase())
    await dialog.getByLabel("Payee").press("Tab")
    await expect(dialog.getByLabel("Category")).toContainText(category)

    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await dialog.waitFor({ state: "hidden" })
  } finally {
    // The row first: deleting the category only uncategorizes it, and the suite shares
    // one database, so a row left here inflates every later month total.
    await deleteTransactionsMatching(payee)
    await page.goto("/budget/categories")
    await page.getByRole("button", { name: `Delete ${category}` }).click()
    await page.getByRole("button", { name: "Delete category" }).click()
    await expect(page.getByText(category, { exact: true })).toHaveCount(0)
  }
})
