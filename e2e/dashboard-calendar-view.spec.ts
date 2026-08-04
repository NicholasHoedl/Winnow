import { expect, test } from "./_test"

// The dashboard calendar's month/week toggle.
//
// The choice lives in the URL rather than in client state, so the server renders the
// right view — that is what these assert: a bare "/" is the month, `?calendar=week` is
// the week grid, and the control moves between them.
//
// The week used to be a chip list of seven columns, which this located as
// `.grid.grid-cols-7`. It is the real `TimeGrid` now — the same component /calendar
// renders — so the assertion is that an hour-blocked grid appears, not just seven
// columns. The month view is also seven columns of days, which is exactly why the
// old locator could not tell them apart.

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

  // A time grid with seven day columns, and the heading becomes a date range.
  const grid = page.getByTestId("time-grid")
  await expect(grid).toBeVisible()
  await expect(grid.getByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/)).toHaveCount(7)
  await expect(page.locator("main h2").filter({ hasText: /–/ })).toBeVisible()

  await control.getByRole("link", { name: "month" }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(heading).toBeVisible()
  // …and the time grid is gone again, rather than both views rendering at once.
  await expect(page.getByTestId("time-grid")).toHaveCount(0)
})

test("an unrecognised calendar param falls back to the month", async ({
  page,
}) => {
  await page.goto("/?calendar=fortnight")
  await expect(
    page.locator("main h2").filter({ hasText: /\d{4}$/ }),
  ).toBeVisible()
})
