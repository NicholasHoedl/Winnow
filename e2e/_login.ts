import { expect, type Locator, type Page } from "@playwright/test"

// Shared by e2e/auth.setup.ts and e2e-prod/auth.setup.ts. Extracted rather than copied:
// two setups with their own copy of the login selectors is exactly the sort of duplicated
// list that has drifted in this repo before.
//
// Not named *.spec.ts, so Playwright does not collect it as a test file.
/**
 * The dashboard's own heading, and the suite's "signed in and the dashboard rendered"
 * signal — eight specs waited on it.
 *
 * A function rather than eight copies of the pattern, for the reason this file already
 * exists: when the greeting became time-aware, the literal every one of them matched went
 * away at once, and the failure surfaced as the AUTH SETUP timing out rather than as
 * anything to do with a greeting.
 *
 * Matched loosely on purpose. What these callers mean is "the dashboard is up", not "it is
 * currently the afternoon" — pinning the exact word would make a passing suite depend on
 * the hour it runs at.
 */
export function dashboardHeading(page: Page): Locator {
  return page.getByRole("heading", {
    name: /^Good (morning|afternoon|evening), /,
  })
}

export async function signIn(page: Page) {
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD
  if (!email || !password) {
    throw new Error(
      "SEED_USER_EMAIL / SEED_USER_PASSWORD must be set (run pnpm db:seed).",
    )
  }

  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()

  // Generous timeout: on a cold `next dev` the /login + dashboard compiles can overrun the
  // default expect timeout, flaking this once-per-run setup.
  await expect(dashboardHeading(page)).toBeVisible({
    timeout: 30_000,
  })
}
