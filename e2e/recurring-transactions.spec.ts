import { test, expect } from "@playwright/test"

// Browser coverage for T3-S10. Three things this must prove:
//   1. the create-time preview counts what will actually post, and refuses a
//      back-dated start before it fills the ledger;
//   2. a posted row is marked as belonging to a series;
//   3. "Stop repeating" removes the rule and KEEPS what it already posted.
//
// Cleanup is not optional here. Playwright runs serially against the persistent dev
// database, so a rule left behind would keep posting transactions on every later run
// and break specs that assert on visible transaction text. "Stop repeating" is both
// the assertion and the cleanup; the posted row is deleted after it.

test("a repeating transaction posts, is badged, and can be stopped", async ({
  page,
}) => {
  const payee = `E2E Repeat ${Date.now()}`
  const row = page.locator("div.bg-card").filter({ hasText: payee })

  await page.goto("/budget")
  await page.getByRole("button", { name: "Add", exact: true }).click()

  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Amount", { exact: false }).fill("7")
  await dialog.getByLabel("Payee").fill(payee)

  // Daily starting today is the one schedule with a deterministic catch-up: exactly
  // one cycle, whatever day the suite happens to run on.
  await dialog.getByLabel("Repeat").click()
  await page.getByRole("option", { name: "Daily" }).click()

  const starts = dialog.getByLabel("Starts")
  // The field defaults to the app's today, which is the user's timezone, not the
  // runner's — read it rather than computing one that could be a day off.
  const today = await starts.inputValue()
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)

  const submit = dialog.getByRole("button", { name: "Add", exact: true })

  // A back-dated start is the foot-gun: it would post hundreds of rows at once.
  await starts.fill("2020-01-01")
  await expect(
    dialog.getByText(/would add \d+ transactions at once/),
  ).toBeVisible()
  await expect(submit).toBeDisabled()

  await starts.fill(today)
  await expect(
    dialog.getByText("Adds 1 transaction now to catch up."),
  ).toBeVisible()
  await expect(submit).toBeEnabled()

  await submit.click()
  await dialog.waitFor({ state: "hidden" })

  // The rule posted its first transaction, and the row says where it came from.
  await expect(row).toBeVisible()
  await expect(row.getByRole("img", { name: "Repeating" })).toBeVisible()

  // "Skip this month's bill" is deliberately just the existing delete: catch-up is
  // bounded below by posted_through, so a deleted occurrence never comes back on its
  // own. Undo must therefore restore it INTO its series — a restore that dropped
  // series_id would quietly turn a skipped bill into a detached one-off.
  await row.getByRole("button", { name: "Transaction actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row).toHaveCount(0)
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(row).toBeVisible()
  await expect(row.getByRole("img", { name: "Repeating" })).toBeVisible()

  // Stop repeating: the schedule goes, the money stays.
  await row.getByRole("button", { name: "Transaction actions" }).click()
  await page.getByRole("menuitem", { name: "Stop repeating" }).click()

  const confirm = page.getByRole("alertdialog")
  await expect(confirm).toContainText("The ones already recorded are kept.")
  await confirm.getByRole("button", { name: "Stop repeating" }).click()

  await expect(row.getByRole("img", { name: "Repeating" })).toHaveCount(0)
  await expect(row).toBeVisible()

  await row.getByRole("button", { name: "Transaction actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row).toHaveCount(0)
})
