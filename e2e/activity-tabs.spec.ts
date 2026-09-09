import { test, expect } from "./_test"

// Browser coverage for ADR-0020: the Activity section's five pages share one strip of
// pills under the heading, the lit pill says where you are, and each pill lands. The ⋮
// menu that used to hold Lists and Repeating tasks is gone with it.

const PAGES = [
  ["/activity", "Tasks"],
  ["/activity/habits", "Habits"],
  ["/activity/routines", "Routines"],
  ["/activity/lists", "Lists"],
  ["/activity/repeating", "Repeating tasks"],
] as const

function strip(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "Activity sections" })
}

test("every Activity page carries the strip, with its own pill lit", async ({
  page,
}) => {
  for (const [href, label] of PAGES) {
    await page.goto(href)
    await expect(
      page.getByRole("heading", { level: 1, name: "Activity" }),
    ).toBeVisible()
    // `exact`: "Tasks" is a substring of "Repeating tasks".
    await expect(
      strip(page).getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "page")
    // Exactly one lit pill — a prefix match on `/activity` would light Tasks everywhere.
    await expect(strip(page).locator("[aria-current=page]")).toHaveCount(1)
  }
})

test("the pills navigate, and the old menu is gone", async ({ page }) => {
  await page.goto("/activity")
  await expect(
    page.getByRole("button", { name: "Activity actions" }),
  ).toHaveCount(0)

  await strip(page).getByRole("link", { name: "Lists", exact: true }).click()
  await expect(page).toHaveURL(/\/activity\/lists$/)
  await expect(page.getByLabel("New list name")).toBeVisible()

  await strip(page)
    .getByRole("link", { name: "Repeating tasks", exact: true })
    .click()
  await expect(page).toHaveURL(/\/activity\/repeating$/)

  await strip(page).getByRole("link", { name: "Tasks", exact: true }).click()
  await expect(page).toHaveURL(/\/activity$/)
  await expect(page.getByLabel("Quick add task")).toBeVisible()
})

// The Tasks page is tasks. The routines row (T13) and the habit strip (T12d) that stood
// above the list went in T25, once each had a pill of its own a hundred pixels above them.
test("the Tasks page holds only tasks", async ({ page }) => {
  await page.goto("/activity")
  await expect(page.getByTestId("routines-line")).toHaveCount(0)
  await expect(page.getByTestId("habit-chip")).toHaveCount(0)
  await expect(page.getByLabel("Quick add task")).toBeVisible()
})
