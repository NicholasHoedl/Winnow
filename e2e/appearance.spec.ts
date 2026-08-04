import { test, expect, type Page } from "./_test"

// Browser coverage for T6a-S5: appearance mirrored into the account.
//
// The point of the mirror is durability, so the two things worth proving are that a
// choice made on a device REACHES the account (and therefore the export, where it was
// conspicuously missing), and that a device which has never seen the account ADOPTS it.
// Neither is visible from the UI alone — the page looks identical either way, because
// localStorage is still what it renders from.
//
// This covered a colour palette as well until the picker was retired for a single scheme.
// The theme is now the whole of "appearance".

/** What the account is holding, read back through the export. */
async function savedTheme(page: Page) {
  const response = await page.request.get("/settings/export")
  expect(response.status()).toBe(200)
  const body = (await response.json()) as {
    preferences: { theme: string } | null
  }
  return body.preferences?.theme
}

/**
 * Pick a theme and wait for the account to actually hold it.
 *
 * Waiting is not politeness. The write-through is a fire-and-forget Server Action with no
 * ordering guarantee, so leaving one in flight and starting another lets a slow earlier
 * write land last — which is exactly how an early version of this file left the dev
 * account on the wrong value while its cleanup reported success.
 */
async function chooseTheme(page: Page, label: string, value: string) {
  await page.goto("/settings")
  // Wait for next-themes to have read storage before clicking. It writes `light` or
  // `dark` onto <html> once mounted, and until then `theme` is undefined and the
  // control's onClick does nothing — a click that lands early is a silent no-op the
  // assertion below would blame on the button.
  await expect(page.locator("html")).toHaveClass(/light|dark/)
  const button = page.getByRole("button", { name: label, exact: true })
  await button.click()
  await expect(button).toHaveAttribute("aria-pressed", "true")
  await expect
    .poll(async () => await savedTheme(page), { timeout: 10_000 })
    .toBe(value)
}

test.beforeEach(async ({ page }) => {
  // Start each test as a device that ALREADY has a preference.
  //
  // Playwright hands every test a fresh context from the saved storage state, which may
  // carry no theme — and a device with none is exactly the one `AppearanceSync` adopts
  // the account's value onto, one time, from an effect. That adoption lands after the
  // click below and overwrites it, so the control snaps back and the assertion reads a
  // button that was pressed a moment ago. Seeding removes the race everywhere except
  // where it is the point: the adoption test clears this again on purpose.
  await page.goto("/settings")
  await page.evaluate(() => localStorage.setItem("theme", "system"))
})

test.afterEach(async ({ page }) => {
  // Put the default back so the dev account isn't left on a forced theme.
  await chooseTheme(page, "System", "system")
})

test("a theme chosen on a device reaches the account and the export", async ({
  page,
}) => {
  // chooseTheme only returns once the account holds it — written through by the sync
  // component, not by the settings control, which only touches localStorage and <html>.
  await chooseTheme(page, "Dark", "dark")
  expect(await savedTheme(page)).toBe("dark")
})

test("a device that has never seen the account adopts its appearance", async ({
  page,
}) => {
  // The branch that makes mirroring worth doing, and the one no amount of clicking
  // around would exercise: only a browser with NO stored preference adopts.
  await chooseTheme(page, "Light", "light")

  // Become a fresh device: same session, no remembered appearance.
  await page.evaluate(() => localStorage.removeItem("theme"))
  await page.goto("/settings")

  await expect(
    page.getByRole("button", { name: "Light", exact: true }),
  ).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator("html")).toHaveClass(/light/)
})

test("a device with its own preference is not overruled by the account", async ({
  page,
}) => {
  // The mirror image of the case above. A stored choice wins, and writes through.
  await chooseTheme(page, "Dark", "dark")

  // Reloading must not pull the previous value back down over it.
  await page.goto("/settings")
  await expect(
    page.getByRole("button", { name: "Dark", exact: true }),
  ).toHaveAttribute("aria-pressed", "true")
})
