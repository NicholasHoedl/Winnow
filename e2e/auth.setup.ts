import { test as setup } from "@playwright/test"

import { signIn } from "./_login"

// Logs in once via the credentials form; every spec reuses the saved session.
const authFile = "e2e/.auth/user.json"

setup("authenticate", async ({ page }) => {
  await signIn(page)

  // Wait for `DigestBanner` to record that it has run today BEFORE the state is captured.
  //
  // The banner decides once a day and remembers with a `winnow:digest-seen:<id>` key in
  // localStorage. That write happens in an effect — so capturing the state the instant
  // `signIn` resolves is a race, and losing it bakes the unseen state into `user.json`,
  // which Playwright then restores per test: the banner opens on the FIRST (app) page of
  // EVERY test for the whole run, shifting every layout under it.
  //
  // T45 took the cost of losing that race down, without removing it. The digest is computed
  // during the app shell's server render now, so there is no `getDigest()` POST left to land
  // in the same window as a quick-add write and miscount `serverWrites` (see
  // `_server-write.ts`, whose `withArguments` matcher stays for the general case).
  //
  // Bounded and non-fatal on purpose. The banner legitimately writes nothing when the key is
  // already today's, or when the effect is cancelled by an unmount first — neither of which
  // should fail authentication for the entire suite. The point is to bake the key in when
  // there IS one, not to require one.
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
