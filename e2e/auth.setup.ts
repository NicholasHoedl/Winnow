import { test as setup } from "@playwright/test"

import { signIn } from "./_login"

// Logs in once via the credentials form; every spec reuses the saved session.
const authFile = "e2e/.auth/user.json"

setup("authenticate", async ({ page }) => {
  await signIn(page)
  await page.context().storageState({ path: authFile })
})
