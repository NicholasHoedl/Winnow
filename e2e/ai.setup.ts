import { test as setup, expect } from "@playwright/test"

/**
 * Point the companion at the local stub, through the settings page.
 *
 * Until T11 this came from `.env`, which both `pnpm dev` and Playwright read. The AI_*
 * env vars are gone — configuration lives in `user_preferences` now — so the suite has to
 * put it there itself, once, before any companion spec runs.
 *
 * It drives the real form rather than writing to the database directly. That costs a few
 * seconds and buys two things: no second database client in the test harness, and the
 * settings path itself is exercised on every single run, so a regression that breaks
 * saving these values fails the whole suite loudly instead of hiding until someone opens
 * the page.
 *
 * No API key is set. The stub does not check auth, and `aiReady` deliberately does not
 * require a key — which is the same reason a local model works without one.
 */
setup("configure the AI stub", async ({ page }) => {
  await page.goto("/settings")

  const section = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "AI companion" }) })

  await section.getByRole("button", { name: "On", exact: true }).click()
  await section
    .getByRole("button", { name: "OpenAI-compatible", exact: true })
    .click()
  await section.getByLabel("Base URL").fill("http://127.0.0.1:3100")
  await section.getByLabel("Model", { exact: true }).fill("stub")
  await section.getByRole("button", { name: "Save AI settings" }).click()

  await expect(page.getByText("AI settings saved")).toBeVisible()

  // Proven by its effect, not by the toast: the companion is only actually reachable once
  // `aiReady` is satisfied, and that is what every companion spec depends on.
  //
  // `domcontentloaded` and a generous timeout because this is the FIRST hit on `/companion`
  // in the run, and Turbopack compiles a route on demand — the default `load` waits for
  // every subresource of a page being built from scratch, which overran 30s and failed the
  // setup for a reason that had nothing to do with the settings it had just saved.
  await page.goto("/companion", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  })
  await expect(
    page.getByRole("heading", { name: "Companion" }).first(),
  ).toBeVisible()
})
