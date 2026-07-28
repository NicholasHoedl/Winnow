import { expect, type Page } from "@playwright/test"

// Shared by e2e/auth.setup.ts and e2e-prod/auth.setup.ts. Extracted rather than copied:
// two setups with their own copy of the login selectors is exactly the sort of duplicated
// list that has drifted in this repo before.
//
// Not named *.spec.ts, so Playwright does not collect it as a test file.
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
  await expect(
    page.getByRole("heading", { name: /good to see you/i }),
  ).toBeVisible({
    timeout: 30_000,
  })
}
