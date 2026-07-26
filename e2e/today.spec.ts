import { test, expect } from "@playwright/test"

// Browser coverage for T2-S4: the Today hub renders the merged agenda and its tasks
// stay actionable there (quick-add defaults a new task to today).
//
// Plus T4-S1's regression test: /today was never in ANY module's revalidate list, so
// a mutation elsewhere left the client router cache serving a stale hub.

test("the today hub lists a task due today and completes it in place", async ({
  page,
}) => {
  const title = `E2E today ${Date.now()}`

  await page.goto("/todos")
  const input = page.getByLabel("Quick add task")
  await input.fill(title)
  await input.press("Enter")
  await expect(
    page.locator("div.bg-card").filter({ hasText: title }),
  ).toBeVisible()

  await page.goto("/today")
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 }),
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible()

  // Completing from the hub flips the row (the label swaps with the state).
  const complete = page.getByLabel(`Complete ${title}`)
  await expect(complete).toBeVisible()
  await complete.click()
  await expect(page.getByLabel(`Reopen ${title}`)).toBeVisible()

  // Cleanup via the todos list.
  await page.goto("/todos")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const row = page.locator("div.bg-card").filter({ hasText: title })
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(
    page.locator("div.bg-card").filter({ hasText: title }),
  ).toHaveCount(0)
})

// A freshness smoke test for the hub's macro card, navigating with <Link> rather than
// goto() so it exercises the client router cache.
//
// Honest about its limits: this does NOT currently fail if /today is left out of
// revalidateMeals(). Every route here is dynamic and Next uses staleTime 0 for those,
// so navigation refetches either way. What it does pin down is that the hub's card
// reads the same data /meals writes — which is worth having, and would start catching
// the revalidation case if staleTimes were ever raised.
test("logging a meal refreshes the today hub's macro card", async ({
  page,
}) => {
  const meal = `e2ehub${Date.now()}`
  // The sidebar nav link also points at /meals, so filter to the stat card by its label.
  const macroCard = page
    .locator("a[href='/meals']")
    .filter({ hasText: "Macros" })

  await page.goto("/today")
  await expect(macroCard).toBeVisible()
  const before = await macroCard.innerText()

  await page.getByRole("link", { name: "Meals", exact: true }).click()
  await expect(page).toHaveURL(/\/meals/)
  const bar = page.getByLabel("Quick add meal")
  await bar.fill(`${meal} 640cal 41p 33c 11f`)
  await bar.press("Enter")
  const entry = page.locator("div.bg-card").filter({ hasText: meal })
  await expect(entry).toBeVisible()

  await page.getByRole("link", { name: "Today", exact: true }).click()
  await expect(page).toHaveURL(/\/today/)
  await expect(macroCard).not.toHaveText(before)

  await page.getByRole("link", { name: "Meals", exact: true }).click()
  await entry.getByRole("button", { name: "Entry actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(entry).toHaveCount(0)
})
