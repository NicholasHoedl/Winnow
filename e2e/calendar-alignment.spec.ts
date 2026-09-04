import { test, expect } from "./_test"

/**
 * The day columns have to line up with their own headings.
 *
 * Reported from real use: the vertical rules were visibly out of step with the weekday
 * headings, on `/calendar` and on the dashboard card, which share `TimeGrid`.
 *
 * The cause is structural rather than arithmetic. The grid renders three sibling rows —
 * headings, all-day, and the hour grid — and only the last is `overflow-y-auto`. A classic
 * scrollbar takes its width out of that row's content box and out of nobody else's, so its
 * seven `flex-1` columns are each a fraction narrower than the seven above them and the
 * error accumulates left to right. The fix reserves the same gutter on all three.
 *
 * **This file cannot reproduce the fault, and that is worth knowing before trusting it.**
 * Headless Chromium and WebKit both draw zero-width overlay scrollbars, so there is no
 * width to lose; a headed browser cannot be launched in the environment this was written
 * in. So the geometry assertion below passes on a broken build too.
 *
 * What it does catch is the regression that would actually happen: one of the three rows
 * losing its reservation while the others keep theirs. That is asserted on the computed
 * style, which is platform-independent and true whether or not a scrollbar has any width.
 * The geometry check is kept beside it for the structural faults it does catch — a stray
 * padding or border on one row only.
 */
test("every row of the time grid reserves the same scrollbar gutter", async ({
  page,
}) => {
  await page.goto("/calendar?view=week")
  const grid = page.getByTestId("time-grid")
  await expect(grid).toBeVisible()

  const report = await grid.evaluate((root) => {
    const scroller = root.querySelector('[data-testid="time-grid-scroller"]')
    if (!scroller) throw new Error("no time-grid-scroller")
    // Structural, because none of these rows carries a test id of its own: the headings
    // are the grid's first row, and the hour columns are the first row inside the
    // scroller. Both lead with the hour gutter, which is why the days start at index 1.
    const headRow = root.firstElementChild
    const hourRow = scroller.firstElementChild
    const cols = (row: Element | null) =>
      row ? Array.from(row.children).slice(1) : []
    const heads = cols(headRow)
    const hours = cols(hourRow)
    const left = root.getBoundingClientRect().left
    const edge = (el: Element) =>
      Math.round(el.getBoundingClientRect().left - left)

    // The all-day row is only present when something is in it.
    const allDay = root.querySelector('[aria-label="All-day events"]')
    const gutterOf = (el: Element | null) =>
      el ? getComputedStyle(el).scrollbarGutter : "absent"

    return {
      headCount: heads.length,
      hourCount: hours.length,
      gutters: {
        headings: gutterOf(headRow),
        scroller: gutterOf(scroller),
        allDay: gutterOf(allDay),
      },
      // Reported so a failure says what the scrollbar cost rather than only that
      // something moved. Zero on every browser this suite can run.
      scrollbar: scroller.getBoundingClientRect().width - scroller.clientWidth,
      worst: Math.max(
        ...heads.map((h, i) => Math.abs(edge(h) - edge(hours[i] ?? h))),
      ),
    }
  })

  expect(report.headCount).toBe(7)
  expect(report.hourCount).toBe(7)

  // The reservation itself. `absent` is allowed only for the all-day row, which is not
  // rendered when the week has no all-day events.
  expect(report.gutters.headings).toBe("stable")
  expect(report.gutters.scroller).toBe("stable")
  expect(["stable", "absent"]).toContain(report.gutters.allDay)

  expect(
    report.worst,
    `columns drift by ${report.worst}px; the scroller's scrollbar takes ${report.scrollbar}px`,
  ).toBeLessThanOrEqual(1)
})
