import { test as setup } from "@playwright/test"

import { signIn } from "./_login"

// Logs in once via the credentials form; every spec reuses the saved session.
const authFile = "e2e/.auth/user.json"

setup("authenticate", async ({ page }) => {
  await signIn(page)

  // Wait for `DigestBanner` to record that it has run today BEFORE the state is captured.
  //
  // The banner asks `getDigest()` once a day and remembers with a `winnow:digest-seen:<id>`
  // key in localStorage. That write happens in an effect, after an await — so capturing the
  // state the instant `signIn` resolves is a race, and losing it is expensive out of all
  // proportion: the unseen state is baked into `user.json`, Playwright restores it per test,
  // and `getDigest()` then fires on the FIRST (app) page of EVERY test for the whole run.
  // That is an extra Server Action landing in the same window as every quick-add write,
  // which is how `serverWrites` came to miscount and drop one (see `_server-write.ts`).
  //
  // Bounded and non-fatal on purpose. The banner legitimately writes nothing when the digest
  // preference is off, when `getDigest()` throws, or when the effect is cancelled by an
  // unmount first — none of which should fail authentication for the entire suite. The point
  // is to bake the key in when there IS one, not to require one.
  await page
    .waitForFunction(
      () =>
        Object.keys(window.localStorage).some((key) =>
          key.startsWith("winnow:digest-seen:"),
        ),
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => {})

  await page.context().storageState({ path: authFile })
})
