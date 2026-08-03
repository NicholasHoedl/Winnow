import { expect, test, type Page } from "@playwright/test"

// The .ics download and the token-authenticated subscribe feed (T5c-a).
//
// The assertions that matter here are the negative ones: the feed must work with NO
// session, a wrong token must be indistinguishable from a missing one, and regenerating
// must actually kill the old URL. A test that only checks "the feed returns a calendar"
// would pass just as happily if the route were session-gated and doing nothing at all.

// The DAY view, not the month grid. The month grid caps a day at three chips and hides
// the rest behind "+N more", so a single stray event from an earlier run makes both the
// creation assertion and the cleanup fail on an event that is really there. The day grid
// renders every occurrence.
const DAY_VIEW = "/calendar?view=day"

/** Create a one-off event on today and wait for it to render. */
async function createEvent(page: Page, title: string) {
  await page.goto(DAY_VIEW)
  await page.getByRole("button", { name: "Add event" }).click()
  await page.getByLabel("Title").fill(title)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(
    page.getByRole("button").filter({ hasText: title }).first(),
  ).toBeVisible()
}

async function deleteEvent(page: Page, title: string) {
  await page.goto(DAY_VIEW)
  // Wait for the view before counting: an assertion that "there are none" passes
  // instantly on a page that hasn't rendered yet, which is how three cleanups in T5b
  // passed while leaving rows behind.
  await expect(page.getByRole("button", { name: "Add event" })).toBeVisible()

  const chip = page.getByRole("button").filter({ hasText: title })
  if ((await chip.count()) === 0) return
  await chip.first().click()
  await page.getByRole("button", { name: "Delete" }).click()
  await expect(page.getByRole("button").filter({ hasText: title })).toHaveCount(
    0,
  )
}

/** The subscribe URL as the settings page renders it. */
async function feedUrl(page: Page): Promise<string> {
  await page.goto("/settings")
  const url = await page.getByTestId("feed-url").innerText()
  expect(url).toContain("/api/calendar/")
  return url.trim()
}

test("the signed-in download serves the calendar as iCalendar", async ({
  page,
  request,
}) => {
  const title = `E2E feed ${Date.now()}`
  try {
    await createEvent(page, title)

    const response = await request.get("/settings/calendar.ics")
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("text/calendar")
    expect(response.headers()["content-disposition"]).toContain(
      "winnow-calendar.ics",
    )

    const body = await response.text()
    expect(body).toContain("BEGIN:VCALENDAR")
    expect(body).toContain(`SUMMARY:${title}`)
    expect(body.trimEnd().endsWith("END:VCALENDAR")).toBe(true)
  } finally {
    await deleteEvent(page, title)
  }
})

test("the feed serves the same calendar with no session at all", async ({
  page,
  browser,
}) => {
  const title = `E2E feed ${Date.now()}`
  // A context with NO storageState — the whole point. If the route were still
  // session-gated this is where it would 307 to /login.
  const anonymous = await browser.newContext()
  try {
    await createEvent(page, title)
    const url = await feedUrl(page)

    const response = await anonymous.request.get(url)
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("text/calendar")
    expect(await response.text()).toContain(`SUMMARY:${title}`)

    // Subscribing must not hand the caller a session by accident.
    expect(response.headers()["set-cookie"]).toBeUndefined()
  } finally {
    await anonymous.close()
    await deleteEvent(page, title)
  }
})

test("a wrong token is a 404, and says nothing more", async ({ browser }) => {
  const anonymous = await browser.newContext()
  try {
    for (const token of ["not-a-real-token", "", "../settings/export"]) {
      const response = await anonymous.request.get(`/api/calendar/${token}`, {
        maxRedirects: 0,
      })
      expect(
        response.status(),
        `token "${token}" should not resolve to anything`,
      ).not.toBe(200)
      expect(await response.text()).not.toContain("BEGIN:VCALENDAR")
    }
  } finally {
    await anonymous.close()
  }
})

test("regenerating the address kills the old one", async ({
  page,
  browser,
}) => {
  const before = await feedUrl(page)

  const anonymous = await browser.newContext()
  try {
    expect((await anonymous.request.get(before)).status()).toBe(200)

    await page.getByRole("button", { name: "Regenerate" }).click()
    await page.getByRole("button", { name: "Generate new address" }).click()
    await expect(page.getByText("New address generated")).toBeVisible()

    const after = await feedUrl(page)
    expect(after).not.toBe(before)

    // The old URL must stop working immediately — that is the entire revocation story.
    expect((await anonymous.request.get(before)).status()).toBe(404)
    expect((await anonymous.request.get(after)).status()).toBe(200)
  } finally {
    await anonymous.close()
  }
})
