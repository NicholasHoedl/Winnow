import { test as setup } from "@playwright/test"

import { signIn } from "../e2e/_login"

// Same login as the dev suite, but its own storage state so this config can run on its
// own without depending on `pnpm test:e2e` having gone first.
const authFile = "e2e-prod/.auth/user.json"

setup("authenticate", async ({ page }) => {
  await signIn(page)
  await page.context().storageState({ path: authFile })
})
