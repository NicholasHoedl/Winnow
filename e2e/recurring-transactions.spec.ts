import { test, expect } from "./_test"

import { visibleCard } from "./_card"

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
  const row = visibleCard(page, payee)

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

/**
 * Editing the SCHEDULE, not the row it posted.
 *
 * `updateTransactionRecurrence` shipped with T3-S10 and nothing called it until now: the
 * dialog's own comment said a posted row is a record rather than a template, which was
 * true and left the template unreachable — changing a rent amount meant stopping the rule
 * and rebuilding the schedule from memory.
 *
 * The load-bearing assertion is the one in the middle: after the rule's amount changes,
 * the transaction it ALREADY posted still reads the old amount. A schedule edit that
 * rewrote history would silently restate a month that has already been reconciled.
 */
test("a repeating transaction's schedule can be edited without rewriting what it posted", async ({
  page,
}) => {
  const payee = `E2E Schedule ${Date.now()}`
  const row = visibleCard(page, payee)

  await page.goto("/budget")
  await page.getByRole("button", { name: "Add", exact: true }).click()

  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Amount", { exact: false }).fill("7")
  await dialog.getByLabel("Payee").fill(payee)
  await dialog.getByLabel("Repeat").click()
  await page.getByRole("option", { name: "Daily" }).click()
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await dialog.waitFor({ state: "hidden" })

  await expect(row).toContainText("7.00")

  // Edit, then switch scope. The toggle only exists for a row that came from a rule —
  // which is itself part of what this asserts.
  await row.getByRole("button", { name: "Transaction actions" }).click()
  await page.getByRole("menuitem", { name: "Edit" }).click()
  await dialog.getByRole("button", { name: "Schedule", exact: true }).click()

  // Prefilled from the RULE, not from the row: the schedule fields are only present in
  // this scope, so seeing them proves which record is being edited.
  await expect(dialog.getByLabel("Amount", { exact: false })).toHaveValue("7")
  await expect(dialog.getByLabel("Repeat")).toContainText("Daily")

  await dialog.getByLabel("Amount", { exact: false }).fill("9")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await dialog.waitFor({ state: "hidden" })

  // What it already posted is untouched — the point of the whole test.
  await expect(row).toContainText("7.00")
  await expect(row.getByRole("img", { name: "Repeating" })).toBeVisible()

  // And the rule itself kept the new figure.
  await row.getByRole("button", { name: "Transaction actions" }).click()
  await page.getByRole("menuitem", { name: "Edit" }).click()
  await dialog.getByRole("button", { name: "Schedule", exact: true }).click()
  await expect(dialog.getByLabel("Amount", { exact: false })).toHaveValue("9")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await dialog.waitFor({ state: "hidden" })

  // Cleanup, as the test above: the rule would otherwise keep posting on every run.
  await row.getByRole("button", { name: "Transaction actions" }).click()
  await page.getByRole("menuitem", { name: "Stop repeating" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Stop repeating" })
    .click()
  await expect(row.getByRole("img", { name: "Repeating" })).toHaveCount(0)

  await row.getByRole("button", { name: "Transaction actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row).toHaveCount(0)
})
