import { test, expect, type Page } from "./_test"

// Browser coverage for T6a-S5: appearance mirrored into the account.
//
// The point of the mirror is durability, so the two things worth proving are that a
// choice made on a device REACHES the account (and therefore the export, where it was
// conspicuously missing), and that a device which has never seen the account ADOPTS it.
// Neither is visible from the UI alone — the page looks identical either way, because
// localStorage is still what it renders from.

/** The palette the account is holding, read back through the export. */
async function savedAppearance(page: Page) {
  const response = await page.request.get("/settings/export")
  expect(response.status()).toBe(200)
  const body = (await response.json()) as {
    preferences: { theme: string; palette: string } | null
  }
  return body.preferences
}

/**
 * Pick a palette and wait for the account to actually hold it.
 *
 * Waiting is not politeness. The write-through is a fire-and-forget Server Action with
 * no ordering guarantee, so leaving one in flight and starting another lets a slow
 * earlier write land last — which is exactly how an early version of this file left the
 * dev account on the wrong colour while its cleanup reported success.
 */
async function choosePalette(page: Page, label: string, id: string) {
  await page.goto("/settings")
  await page.getByRole("button", { name: label }).click()
  await expect(page.getByRole("button", { name: label })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect
    .poll(async () => (await savedAppearance(page))?.palette, {
      timeout: 10_000,
    })
    .toBe(id)
}

test.afterEach(async ({ page }) => {
  // Put the default back so the dev account isn't left recoloured.
  await choosePalette(page, "Indigo & Amber", "indigo")
})

test("a palette chosen on a device reaches the account and the export", async ({
  page,
}) => {
  // choosePalette only returns once the account holds it — written through by the sync
  // component, not by the settings form, which only touches localStorage and <html>.
  await choosePalette(page, "Emerald & Coral", "emerald")
  expect((await savedAppearance(page))?.palette).toBe("emerald")
})

test("a device that has never seen the account adopts its appearance", async ({
  page,
}) => {
  // The branch that makes mirroring worth doing, and the one no amount of clicking
  // around would exercise: only a browser with NO stored preference adopts.
  await choosePalette(page, "Rose & Gold", "rose")

  // Become a fresh device: same session, no remembered appearance.
  await page.evaluate(() => localStorage.removeItem("winnow-palette"))
  await page.goto("/settings")

  await expect(
    page.getByRole("button", { name: "Rose & Gold" }),
  ).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator("html")).toHaveAttribute("data-palette", "rose")
})

test("a device with its own preference is not overruled by the account", async ({
  page,
}) => {
  // The mirror image of the case above. A stored choice wins, and writes through.
  await choosePalette(page, "Teal & Tangerine", "teal")

  // Reloading must not pull the previous value back down over it.
  await page.goto("/settings")
  await expect(
    page.getByRole("button", { name: "Teal & Tangerine" }),
  ).toHaveAttribute("aria-pressed", "true")
})
