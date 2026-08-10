import { test, expect, type Page } from "./_test"

/**
 * Browser coverage for T11: the companion configured from settings rather than the
 * environment.
 *
 * The load-bearing assertion is the negative one — **the API key never reaches the
 * browser.** Everything else here is ordinary form behaviour; that one is the reason the
 * key is fetched by a separate query, kept out of `UserPreferences`, and rendered as a
 * masked hint. A regression there would be invisible on screen and is exactly the kind of
 * thing that ships.
 *
 * `e2e/ai.setup.ts` has already pointed this account at the stub, so these tests must put
 * the working configuration back when they are done — every companion spec depends on it.
 */

const STUB_URL = "http://127.0.0.1:3100"
const STUB_MODEL = "stub"
const KEY = "sk-test-e2e-abcdefgh9z7q"
const SECOND_KEY = "sk-test-e2e-zyxwvuts4321"

/**
 * The key form's submit button, which is NOT always called the same thing.
 *
 * It reads "Save key" on a fresh install and "Replace key" once a key is stored
 * (`ai-section.tsx`). Matching the literal "Save key" made this file state-dependent, and
 * that is what made it look flaky: on a machine with a real key stored, the locator could
 * never match and the test burned its entire timeout waiting. It then passed on every run
 * afterwards — because the `afterEach` below had removed the key in the meantime, so the
 * state that caused the failure no longer existed to cause it again.
 */
const SAVE_KEY = /^(Save|Replace) key$/

function section(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "AI companion" }) })
}

/** Put the stub configuration back, whatever the test did. */
test.afterEach(async ({ page }) => {
  await page.goto("/settings")
  const ai = section(page)
  await ai.getByRole("button", { name: "On", exact: true }).click()
  await ai
    .getByRole("button", { name: "OpenAI-compatible", exact: true })
    .click()
  await ai.getByLabel("Base URL").fill(STUB_URL)
  await ai.getByLabel("Model", { exact: true }).fill(STUB_MODEL)
  await ai.getByRole("button", { name: "Save AI settings" }).click()
  await expect(page.getByText("AI settings saved")).toBeVisible()

  // This clears the key unconditionally, including one this file did not create — which is
  // destructive against the shared dev database and used to be unrecoverable. It is safe
  // now only because `ai.teardown.ts` backs the key up before the run and writes it back
  // afterwards, at the database level. Do not remove that teardown.
  const remove = ai.getByRole("button", { name: "Remove key" })
  if (await remove.count()) {
    await remove.click()
    await expect(page.getByText("API key removed")).toBeVisible()
  }
})

test("a saved API key is never sent to the browser", async ({ page }) => {
  await page.goto("/settings")
  const ai = section(page)

  await ai.getByLabel("API key").fill(KEY)
  await ai.getByRole("button", { name: SAVE_KEY }).click()
  await expect(page.getByText("API key saved")).toBeVisible()

  // The field is write-only: what was typed is gone, and the placeholder identifies the
  // saved key by its LAST FOUR rather than showing it.
  await expect(ai.getByLabel("API key")).toHaveValue("")
  await expect(ai.getByLabel("API key")).toHaveAttribute(
    "placeholder",
    /Saved · ••••9z7q/,
  )

  // The whole point. Not the input's value — the entire document, including the RSC
  // payload streamed into the page, which is where a key leaks if it was ever put in the
  // preferences object handed to a client component.
  await page.reload()
  const html = await page.content()
  expect(html).not.toContain(KEY)
  expect(html).not.toContain("abcdefgh9z7q")
  // The hint is there, so this is proving absence of the key rather than absence of a
  // rendered section.
  expect(html).toContain("9z7q")
})

test("a second key replaces the first, under a different button label", async ({
  page,
}) => {
  await page.goto("/settings")
  const ai = section(page)

  await ai.getByLabel("API key").fill(KEY)
  await ai.getByRole("button", { name: SAVE_KEY }).click()
  await expect(page.getByText("API key saved")).toBeVisible()

  // The button RENAMES itself once something is stored, and that is the whole point of
  // this test. Matching the literal "Save key" is what made this file state-dependent: on
  // a machine with a key already saved the locator could never match, the test burned its
  // entire timeout, and the `afterEach` then deleted the key — so it passed ever after and
  // the failure read as flakiness. Asserted explicitly here so the coverage does not depend
  // on what happens to be in the database when the suite runs.
  await expect(ai.getByRole("button", { name: "Replace key" })).toBeVisible()

  await ai.getByLabel("API key").fill(SECOND_KEY)
  await ai.getByRole("button", { name: SAVE_KEY }).click()
  await expect(page.getByText("API key saved")).toBeVisible()

  // The hint follows the NEW key, so the replacement landed rather than being ignored.
  await expect(ai.getByLabel("API key")).toHaveAttribute(
    "placeholder",
    /Saved · ••••4321/,
  )
  const html = await page.content()
  expect(html).not.toContain(SECOND_KEY)
})

test("settings survive a reload, and the key survives a settings change", async ({
  page,
}) => {
  await page.goto("/settings")
  const ai = section(page)

  await ai.getByLabel("API key").fill(KEY)
  await ai.getByRole("button", { name: SAVE_KEY }).click()
  await expect(page.getByText("API key saved")).toBeVisible()

  // Changing the model must not clear the key. The two are separate forms and separate
  // actions precisely because a write-only field is empty on every render — sharing one
  // form would wipe the key on every save.
  await ai.getByLabel("Model", { exact: true }).fill("some-other-model")
  await ai.getByRole("button", { name: "Save AI settings" }).click()
  await expect(page.getByText("AI settings saved")).toBeVisible()

  await page.reload()
  await expect(ai.getByLabel("Model", { exact: true })).toHaveValue(
    "some-other-model",
  )
  await expect(ai.getByLabel("API key")).toHaveAttribute("placeholder", /Saved/)
})

test("turning the companion off removes the route and the nav tab", async ({
  page,
}) => {
  await page.goto("/settings")
  const ai = section(page)
  await ai.getByRole("button", { name: "Off", exact: true }).click()
  await ai.getByRole("button", { name: "Save AI settings" }).click()
  await expect(page.getByText("AI settings saved")).toBeVisible()

  // Not merely hidden: the page renders nothing. This is ADR-0011's opt-in property, now
  // owned by a setting rather than an env var.
  const nav = page.getByRole("navigation").first()
  await expect(nav.getByRole("link", { name: "Companion" })).toHaveCount(0)

  // Asserted on CONTENT, not on the status code, and the distinction is real. There is a
  // `src/app/(app)/loading.tsx` — a boundary around the WHOLE group, not this route — so
  // Next streams the shell before any page component runs. By the time `notFound()` fires
  // the response is already committed as 200.
  //
  // Measured, after an earlier version of this test asserted 404 and failed. It has always
  // behaved this way; the docs saying "/companion 404s" were describing the intent rather
  // than the behaviour. What the user experiences is what matters and is unchanged: no
  // companion content, and no way to reach it.
  await page.goto("/companion", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("heading", { name: "Companion" })).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Plan", exact: true }),
  ).toHaveCount(0)
})
