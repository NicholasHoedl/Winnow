import { test, expect } from "./_test"

import { visibleCard } from "./_card"

// Browser coverage for T3-S7: the trend charts render as real server-side SVG with
// accessible names, and each shape carries a <title> so hovering names its value.

test("the Trends page renders labelled trend charts", async ({ page }) => {
  const payee = `E2E trend ${Date.now()}`

  // `TrendsSection` returns a "once there are a few months of activity" placeholder when
  // no month in its window has any income or expense — no <svg> at all. One transaction
  // flips that, and seeding it is what stops this test from depending on whatever the
  // shared dev database happens to hold. It failed exactly that way on an empty account,
  // reading as "the charts are gone" rather than "there is nothing to chart".
  await page.goto("/budget")
  await page.getByRole("button", { name: "Add", exact: true }).click()
  const seedDialog = page.getByRole("dialog")
  await seedDialog.getByLabel("Amount", { exact: false }).fill("42")
  await seedDialog.getByLabel("Payee").fill(payee)
  await seedDialog.getByRole("button", { name: "Add", exact: true }).click()
  await seedDialog.waitFor({ state: "hidden" })
  await expect(visibleCard(page, payee)).toBeVisible()

  await page.goto("/budget/trends")

  // Scoped to the Trends section, not the page.
  //
  // `page.locator("svg[role=img]")` used to be page-wide, which quietly assumed nothing
  // else above the charts was an accessible icon. While the charts sat under the ledger, a
  // repeating transaction's "Repeating" badge — a lucide <svg role="img"> with no <title>
  // — resolved first, and `.locator("title")` waited 30s for a child a badge never has.
  // The charts have a page of their own since T30; the scoping stays, since any icon
  // added above this section would do it again.
  const trends = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Trends" }) })
  const charts = trends.locator("svg[role=img]")
  await expect(charts.first()).toBeVisible()

  // Each chart names itself for screen readers.
  const labels = await charts.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? ""),
  )
  expect(labels.some((l) => /income and expenses/i.test(l))).toBe(true)
  expect(labels.some((l) => /net income/i.test(l))).toBe(true)

  // Native tooltips: a <title> inside a shape, reading "<month> · <series>: <amount>".
  const firstTitle = await charts
    .first()
    .locator("title")
    .first()
    .evaluate((node) => node.textContent ?? "")
  expect(firstTitle).toMatch(/·.+:.+\d/)

  await expect(page.getByRole("heading", { name: "Trends" })).toBeVisible()

  // Cleanup, back on the ledger — the suite shares a persistent database and a stray row
  // inflates the month's totals, which `transaction-filters.spec.ts` asserts on.
  await page.goto("/budget")
  const row = visibleCard(page, payee)
  await row.getByRole("button", { name: "Transaction actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(visibleCard(page, payee)).toHaveCount(0)
})
