import { test, expect } from "./_test"

import { visibleCard } from "./_card"

// Browser coverage for the dashboard's agenda: it renders the merged list and its tasks
// stay actionable there.
//
// This was `today.spec.ts`, against a separate `/today` hub. That page ran five of the
// same queries as the dashboard and differed only by this agenda, so it was folded in and
// the assertions came with it — the behaviour under test never changed, only its address.

test("the dashboard agenda lists a task due today and completes it in place", async ({
  page,
}) => {
  const title = `E2E today ${Date.now()}`

  // The dialog prefills today's date; quick-add deliberately does not (T5a-S6 made it
  // capture-into-Someday), and this spec needs a task that is actually due today.
  await page.goto("/todos")
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(title)
  await dialog.getByRole("button", { name: "Create" }).click()
  await expect(visibleCard(page, title)).toBeVisible()

  await page.goto("/")
  // Scoped to the agenda region, not the page. A task due today is ALSO listed in the
  // dashboard's Tasks card, so an unscoped label lookup matches two checkboxes and
  // Playwright's strict mode rejects it — and more to the point, this spec is about the
  // agenda specifically, so it should say so.
  const agenda = page.getByRole("region", { name: "Agenda" })
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible()

  // Completing from the agenda flips the row (the label swaps with the state).
  const complete = agenda.getByLabel(`Complete ${title}`)
  await expect(complete).toBeVisible()
  await complete.click()
  await expect(agenda.getByLabel(`Reopen ${title}`)).toBeVisible()

  // Cleanup via the todos list.
  await page.goto("/todos")
  await page.getByRole("button", { name: "All", exact: true }).click()
  const row = visibleCard(page, title)
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(visibleCard(page, title)).toHaveCount(0)
})

// A freshness smoke test for the dashboard's macro card, navigating with <Link> rather
// than goto() so it exercises the client router cache.
//
// Honest about its limits: this does NOT currently fail if "/" is left out of
// revalidateMeals(). Every route here is dynamic and Next uses staleTime 0 for those,
// so navigation refetches either way. What it does pin down is that the card reads the
// same data /meals writes — which is worth having, and would start catching the
// revalidation case if staleTimes were ever raised.
test("logging a meal refreshes the dashboard's macro card", async ({
  page,
}) => {
  const meal = `e2ehub${Date.now()}`
  // The sidebar nav link also points at /meals, so filter to the stat card by its label.
  const macroCard = page
    .locator("a[href='/meals']")
    .filter({ hasText: "Macros" })

  await page.goto("/")
  await expect(macroCard).toBeVisible()
  const before = await macroCard.innerText()

  await page.getByRole("link", { name: "Meals", exact: true }).click()
  await expect(page).toHaveURL(/\/meals/)
  const bar = page.getByLabel("Quick add meal")
  await bar.fill(`${meal} 640cal 41p 33c 11f`)
  await bar.press("Enter")
  const entry = visibleCard(page, meal)
  await expect(entry).toBeVisible()

  await page.getByRole("link", { name: "Dashboard", exact: true }).click()
  // Anchored on the end, or this matches every URL in the app.
  await expect(page).toHaveURL(/\/$/)
  await expect(macroCard).not.toHaveText(before)

  await page.getByRole("link", { name: "Meals", exact: true }).click()
  await entry.getByRole("button", { name: "Entry actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(entry).toHaveCount(0)
})
