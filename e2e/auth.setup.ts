import { test as setup, expect } from "@playwright/test"

// Logs in once via the credentials form; every spec reuses the saved session.
const authFile = "e2e/.auth/user.json"

setup("authenticate", async ({ page }) => {
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD
  if (!email || !password) {
    throw new Error("SEED_USER_EMAIL / SEED_USER_PASSWORD must be set (run pnpm db:seed).")
  }

  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()

  await expect(
    page.getByRole("heading", { name: /good to see you/i }),
  ).toBeVisible()
  await page.context().storageState({ path: authFile })
})
