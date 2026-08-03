import { expect, test } from "./_test"

// The dashboard calendar's month/week toggle.
//
// The choice lives in the URL rather than in client state, so the server renders the
// right view — that is what these assert: a bare "/" is the month, `?calendar=week` is
// the week strip, and the control moves between them.

test("the dashboard calendar switches between month and week", async ({
  page,
}) => {
  await page.goto("/")
  const control = page.getByRole("group", { name: "Calendar view" })
  await expect(control).toBeVisible()

  // Month is the default, and the heading names the month.
  const heading = page.locator("main h2").filter({ hasText: /\d{4}$/ })
  await expect(heading).toBeVisible()

  await control.getByRole("link", { name: "week" }).click()
  await expect(page).toHaveURL(/\?calendar=week$/)

  // The week strip is seven day columns, and the heading becomes a date range.
  const strip = page.locator("main .grid.grid-cols-7").last()
  await expect(strip.locator("> div")).toHaveCount(7)
  await expect(page.locator("main h2").filter({ hasText: /–/ })).toBeVisible()

  await control.getByRole("link", { name: "month" }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(heading).toBeVisible()
})

test("an unrecognised calendar param falls back to the month", async ({
  page,
}) => {
  await page.goto("/?calendar=fortnight")
  await expect(
    page.locator("main h2").filter({ hasText: /\d{4}$/ }),
  ).toBeVisible()
})
