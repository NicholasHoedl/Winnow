import { test, expect } from "./_test"

// Browser coverage for ADR-0024: the Budget section's four pages share one strip of pills
// under the heading, the lit pill says where you are, each pill lands, and the month in
// view rides along. The ⋮ menu that held the category and budget editors is gone with it.

const PAGES = [
  ["/budget", "Transactions"],
  ["/budget/budgets", "Budgets"],
  ["/budget/categories", "Categories"],
  ["/budget/trends", "Trends"],
] as const

function strip(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "Budget sections" })
}

test("every Budget page carries the strip, with its own pill lit", async ({
  page,
}) => {
  for (const [href, label] of PAGES) {
    await page.goto(href)
    await expect(
      page.getByRole("heading", { level: 1, name: "Budget" }),
    ).toBeVisible()
    await expect(
      strip(page).getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "page")
    // Exactly one lit pill — a prefix match on `/budget` would light Transactions
    // everywhere.
    await expect(strip(page).locator("[aria-current=page]")).toHaveCount(1)
  }
})

test("the pills navigate and keep the month, and the old menu is gone", async ({
  page,
}) => {
  await page.goto("/budget?month=2027-06")
  await expect(
    page.getByRole("button", { name: "Budget actions" }),
  ).toHaveCount(0)

  // The month is the section's one piece of context, and a pill that dropped it would
  // make "switch page, pick the month again" one gesture too many.
  await strip(page).getByRole("link", { name: "Budgets", exact: true }).click()
  await expect(page).toHaveURL(/\/budget\/budgets\?month=2027-06$/)
  await expect(page.getByLabel("Total for the month")).toBeVisible()

  // Categories has no month to read, but carries it for the round trip.
  await strip(page)
    .getByRole("link", { name: "Categories", exact: true })
    .click()
  await expect(page).toHaveURL(/\/budget\/categories\?month=2027-06$/)
  await expect(page.getByRole("button", { name: "Add category" })).toBeVisible()

  await strip(page).getByRole("link", { name: "Trends", exact: true }).click()
  await expect(page).toHaveURL(/\/budget\/trends\?month=2027-06$/)
  await expect(page.getByRole("heading", { name: "Trends" })).toBeVisible()

  await strip(page)
    .getByRole("link", { name: "Transactions", exact: true })
    .click()
  await expect(page).toHaveURL(/\/budget\?month=2027-06$/)
  await expect(page.getByLabel("Quick add transaction")).toBeVisible()
})

// The month controls belong to the section, not the ledger: moving a month on a sub-page
// stays on that page.
test("the month navigation stays on the page it is used from", async ({
  page,
}) => {
  await page.goto("/budget/trends?month=2027-06")
  await page.getByRole("link", { name: "Next month" }).click()
  await expect(page).toHaveURL(/\/budget\/trends\?month=2027-07$/)
  await page.getByRole("link", { name: "This month" }).click()
  await expect(page).toHaveURL(/\/budget\/trends$/)
})
