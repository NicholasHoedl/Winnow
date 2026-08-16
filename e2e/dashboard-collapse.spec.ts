import { test, expect, type Page } from "./_test"

// Folding a dashboard card and having it STAY folded — across a reload, which is the only
// part that needed a database column and is therefore the only part worth a browser test.
// The fold itself is optimistic client state and would pass just as well against a version
// that stored nothing at all, so every assertion here is made after a `goto`.
//
// Every card this touches is left EXPANDED at the end. The suite runs serially against one
// database, and a card left folded would remove it from the page for every later spec —
// `dashboard-agenda` and `navigation` both assert on Slate's contents, and they would go red
// pointing at Slate rather than at this file. `goal-momentum.spec.ts` and
// `settings-defaults.spec.ts` carry the same warning for the same reason.

/** The chevron for one card, whichever direction it currently points. */
function toggle(page: Page, name: string) {
  return page.getByRole("button", {
    name: new RegExp(`^(Collapse|Expand) ${name}$`),
  })
}

/**
 * Click a chevron and WAIT FOR THE WRITE, rather than for the card to move.
 *
 * The fold is optimistic, so the card moves in about a millisecond and every assertion about
 * its state passes long before the Server Action has been anywhere near the database.
 * Navigating on the back of one of those assertions aborts the request in flight — Next logs
 * it as `ECONNRESET` — and the fold is simply lost. That is what made an earlier version of
 * this file fail while the feature worked, and it cost a wrong diagnosis on the way through:
 * the atomic write in `setDashboardCard` was blamed for it first.
 *
 * Server Actions POST back to the page's own URL, so the response is the signal.
 */
async function fold(page: Page, name: string) {
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.status() === 200,
    ),
    toggle(page, name).click(),
  ])
}

test("a folded card stays folded across a reload", async ({ page }) => {
  await page.goto("/")

  const slate = page.getByRole("region", { name: "Slate" })
  const chevron = toggle(page, "Slate")

  // Start from a known state rather than assuming one — an earlier run that died mid-test
  // could have left it folded, and this test would then "pass" having proved nothing.
  if ((await chevron.getAttribute("aria-expanded")) === "false") {
    await fold(page, "Slate")
    await expect(slate).toBeVisible()
  }

  await fold(page, "Slate")
  // The body is the region named by the heading, so folding removes it outright. The header
  // stays, which is the difference between collapsed and hidden — there has to be something
  // left to click.
  await expect(slate).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Slate" })).toBeVisible()
  await expect(toggle(page, "Slate")).toHaveAttribute("aria-expanded", "false")

  // THE ASSERTION THIS FILE EXISTS FOR. Everything above is client state; only a reload
  // proves the preference was written and is being read back on the server.
  await page.goto("/")
  await expect(page.getByRole("region", { name: "Slate" })).toHaveCount(0)
  await expect(toggle(page, "Slate")).toHaveAttribute("aria-expanded", "false")

  // And back, which also restores the state for every spec that runs after this one.
  await fold(page, "Slate")
  await expect(page.getByRole("region", { name: "Slate" })).toBeVisible()

  await page.goto("/")
  await expect(page.getByRole("region", { name: "Slate" })).toBeVisible()
  await expect(toggle(page, "Slate")).toHaveAttribute("aria-expanded", "true")
})

test("the stat tiles fold independently of each other", async ({ page }) => {
  // The one case the single-card test cannot cover: `macros` and `budget` are two keys in
  // one list column, so a write that replaced the list rather than adding to it would fold
  // one and silently unfold the other. Nothing else on the dashboard would show that.
  await page.goto("/")

  for (const name of ["Macros", "Budget"]) {
    if ((await toggle(page, name).getAttribute("aria-expanded")) === "false")
      await fold(page, name)
  }

  // One at a time, each verified through a reload before the next. Folding both and then
  // checking once would pass against a column that stored only the LAST key written, which
  // is the failure this test exists to catch.
  await fold(page, "Macros")
  await page.goto("/")
  await expect(toggle(page, "Macros")).toHaveAttribute("aria-expanded", "false")
  await expect(toggle(page, "Budget")).toHaveAttribute("aria-expanded", "true")

  await fold(page, "Budget")
  await page.goto("/")
  // Both, held at once in one column.
  await expect(toggle(page, "Macros")).toHaveAttribute("aria-expanded", "false")
  await expect(toggle(page, "Budget")).toHaveAttribute("aria-expanded", "false")

  // Restore both, and confirm removing one key leaves the other alone.
  await fold(page, "Macros")
  await page.goto("/")
  await expect(toggle(page, "Macros")).toHaveAttribute("aria-expanded", "true")
  await expect(toggle(page, "Budget")).toHaveAttribute("aria-expanded", "false")

  await fold(page, "Budget")
  await page.goto("/")
  await expect(toggle(page, "Macros")).toHaveAttribute("aria-expanded", "true")
  await expect(toggle(page, "Budget")).toHaveAttribute("aria-expanded", "true")
})
