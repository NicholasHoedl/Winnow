import { test, expect, type Locator } from "./_test"

import { visibleCard } from "./_card"
import { serverWrites, withArguments } from "./_server-write"

/**
 * Regression coverage for the rapid-capture defect: every text quick-add in the app used
 * to drop entries typed while the previous one was still in flight — no row, no toast, no
 * error, with the text still sitting in the box. The window was ~300ms, comfortably inside
 * a fast typist's reach, and capture bars are exactly where people type fast.
 *
 * Two causes, one per half of the fix, and this spec is what tells them apart:
 *   - the submit button was `disabled={pending}`, and a form whose submit button is
 *     disabled does no implicit submission, so Enter was simply dead for the duration;
 *   - the field was cleared after the await, so a late clear could wipe the next entry.
 *
 * Hence "no pause": these tests must NOT wait between entries. A wait — even a short one,
 * even an implicit `expect` — reopens the gap the bug lived in and the spec stops testing
 * anything. `fill` + `press` back to back is the whole point.
 */

/** Three entries, back to back, with nothing between them. */
async function burst(input: Locator, entries: string[]) {
  // Before, not between: the burst has to start against a hydrated form, or the first
  // Enter lands on markup whose React handler is not attached yet and the test measures
  // page readiness instead of the bug.
  await expect(input).toBeVisible()
  await input.click()

  // Armed BEFORE the first Enter, awaited after the last. The burst puts every write in
  // flight at once, so this counts them rather than waiting for one.
  // Counting bare Server Actions let `DigestBanner`'s `getDigest()` take one of these slots,
  // so this resolved one write early and the navigation that follows aborted the last entry
  // — the exact loss this helper exists to prevent, proved from a trace rather than argued.
  //
  // `withArguments` rather than a match on the entry text: three of these four bars TRANSFORM
  // what you type before it reaches the action, so matching the raw entry never fires.
  const written = serverWrites(input.page(), entries.length, withArguments)

  for (const entry of entries) {
    await input.fill(entry)
    await input.press("Enter")
  }

  // After, not between: a server action still in flight is aborted if the page navigates
  // or the test ends, which would fail this spec for a reason that has nothing to do with
  // what it covers. Waiting between entries would defeat the whole point, so this waits
  // once, at the end.
  //
  // **This was `waitForTimeout(1_500)`, and that guess is what made the dashboard test
  // flaky.** `docs/HANDOFF.md` measures `/activity` at 1.7–3.4s per render on this machine,
  // so the sleep was routinely shorter than the writes it was covering — and the dashboard
  // test is the only one here that navigates afterwards, which is why it alone flaked.
  // Measured with the actions held at 2.5s: the sleep kept 0 of 3 entries, awaiting the
  // writes kept 3 of 3.
  await expect(input).toHaveValue("")
  await written
}

test("dashboard quick-capture keeps every entry in a burst", async ({
  page,
}) => {
  const tag = `e2eburstdash${Date.now()}`
  const titles = [`${tag}a`, `${tag}b`, `${tag}c`]

  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: /good to see you/i }),
  ).toBeVisible()

  await burst(
    page.getByLabel("Quick add a task"),
    titles.map((title) => `${title} today`),
  )

  // Asserted on /activity rather than the dashboard: quick-capture stamps today, and the
  // dashboard shows only a slice of the day's tasks.
  await page.goto("/activity")
  await page.getByRole("button", { name: "All", exact: true }).click()
  for (const title of titles) {
    await expect(visibleCard(page, title)).toBeVisible()
  }

  for (const title of titles) {
    const row = visibleCard(page, title)
    await row.getByRole("button", { name: "Task actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(visibleCard(page, title)).toHaveCount(0)
  }
})

test("todos quick-add keeps every entry in a burst", async ({ page }) => {
  const tag = `e2ebursttodo${Date.now()}`
  const titles = [`${tag}a`, `${tag}b`, `${tag}c`]

  await page.goto("/activity")
  await burst(page.getByLabel("Quick add task"), titles)

  // Quick-add deliberately sets no due date, so these land in Someday — visible under All.
  await page.getByRole("button", { name: "All", exact: true }).click()
  for (const title of titles) {
    await expect(visibleCard(page, title)).toBeVisible()
  }

  for (const title of titles) {
    const row = visibleCard(page, title)
    await row.getByRole("button", { name: "Task actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(visibleCard(page, title)).toHaveCount(0)
  }
})

test("budget quick-add keeps every entry in a burst", async ({ page }) => {
  const tag = `e2eburstbudget${Date.now()}`
  const descriptions = [`${tag}a`, `${tag}b`, `${tag}c`]

  await page.goto("/budget")
  await burst(
    page.getByLabel("Quick add transaction"),
    descriptions.map((description) => `${description} $4`),
  )

  for (const description of descriptions) {
    await expect(visibleCard(page, description)).toBeVisible()
  }

  // The suite runs serially against the persistent dev database, so rows left here would
  // inflate the month totals other budget specs read.
  for (const description of descriptions) {
    const row = visibleCard(page, description)
    await row.getByRole("button", { name: "Transaction actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(visibleCard(page, description)).toHaveCount(0)
  }
})

test("meals quick-add keeps every entry in a burst", async ({ page }) => {
  const tag = `e2eburstmeal${Date.now()}`
  // `a`, `b`, `d` — deliberately NOT `a`, `b`, `c` like the specs above. The tag ends in
  // digits, and `p`, `c` and `f` are the parser's macro letters, so `…278c` was read as
  // "1785869309278 carbs" — over the 100000 cap, so the action rejected it. That failure
  // looked exactly like a dropped entry (no row, no visible error) and cost real time to
  // tell apart from the bug this file covers.
  //
  // The parser was fixed since: its macro patterns now require a leading word boundary, so
  // a digit-then-letter inside a word is no longer a macro token. `c` would be safe again.
  // Kept as `d` anyway — changing it would re-test the parser rather than this file's
  // subject, and `service.test.ts` covers that directly now.
  const names = [`${tag}a`, `${tag}b`, `${tag}d`]

  await page.goto("/meals")
  await burst(
    page.getByLabel("Quick add meal"),
    names.map((name) => `${name} 100cal 10p 5c 2f`),
  )

  for (const name of names) {
    await expect(visibleCard(page, name)).toBeVisible()
  }

  for (const name of names) {
    const row = visibleCard(page, name)
    await row.getByRole("button", { name: "Entry actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(visibleCard(page, name)).toHaveCount(0)
  }
})
