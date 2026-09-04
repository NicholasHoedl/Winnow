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
  // **`?calendar=month`, not a bare `/`.** This line used to REQUIRE the bare form, which is
  // how it kept passing while the button was broken: with the saved preference set to week,
  // a URL carrying no parameter falls back to that preference, so Month returned you to the
  // week you were trying to leave. The test below is the one that reproduces it.
  await expect(page).toHaveURL(/\?calendar=month$/)
  await expect(heading).toBeVisible()
  // …and the time grid is gone again, rather than both views rendering at once.
  await expect(page.getByTestId("time-grid")).toHaveCount(0)
})

// Named for the RULE, not for what it happens to observe. The fallback is the saved
// `dashboardCalendarView`, which is month only because that is the default — calling it
// "falls back to the month" is the same stale assumption that broke the Month button, and a
// name that says it invites the next person to make it again.
test("an unrecognised calendar param falls back to the saved preference", async ({
  page,
}) => {
  await page.goto("/?calendar=fortnight")
  await expect(
    page.locator("main h2").filter({ hasText: /\d{4}$/ }),
  ).toBeVisible()
})

/**
 * Restored unconditionally rather than at the end of the test that changes it.
 *
 * The suite is serial against one account, so a run that dies mid-test would otherwise leave
 * `dashboardCalendarView` set to week — and the first casualty would be the test above,
 * which reads as a regression in the toggle rather than as debris. Setting it back to the
 * default costs a round trip and is a no-op for the test that never touched it.
 */
test.afterEach(async ({ page }) => {
  await page.goto("/settings")
  await page
    .getByRole("group", { name: "Dashboard calendar opens on", exact: true })
    .getByRole("button", { name: "Month" })
    .click()
  await page.getByRole("button", { name: "Save preferences" }).click()
  await expect(page.getByText("Preferences saved")).toBeVisible()
})

// Reported from real use: set the dashboard to open on week, and the Month button stops
// working. The cause was the mirror of the trap `/calendar` fixed in T14 — the Month link
// omitted `?calendar=` on the reasoning that month was the fallback, which inverts the
// moment the fallback becomes a preference.
test("month is reachable when the dashboard opens on week", async ({
  page,
}) => {
  // `exact`, for the reason HANDOFF §4 gives about this very form: accessible names here are
  // one another's prefixes, and a loose "Calendar opens on" matches this group too.
  const setting = page.getByRole("group", {
    name: "Dashboard calendar opens on",
    exact: true,
  })

  await page.goto("/settings")
  await setting.getByRole("button", { name: "Week" }).click()
  await page.getByRole("button", { name: "Save preferences" }).click()
  await expect(page.getByText("Preferences saved")).toBeVisible()

  // It opens on week, which is the part that already worked.
  await page.goto("/")
  await expect(page.getByTestId("time-grid")).toBeVisible()

  // And Month gets you out again, which is the part that did not.
  await page
    .getByRole("group", { name: "Calendar view" })
    .getByRole("link", { name: "month" })
    .click()
  await expect(page.getByTestId("time-grid")).toHaveCount(0)
  await expect(
    page.locator("main h2").filter({ hasText: /\d{4}$/ }),
  ).toBeVisible()
})
