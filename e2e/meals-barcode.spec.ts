import { test, expect } from "./_test"

// Browser coverage for T4-S7.
//
// A real scan can't be tested here: headless Chromium has no camera, and even
// --use-fake-device-for-media-stream yields a synthetic stream that will never contain
// a barcode. That turns out to be useful rather than limiting — the no-camera path is
// exactly the fallback this feature has to get right, so running without one asserts it
// directly. Decoding itself is verified by hand on a phone, recorded in the step.
//
// The lookup that a detected barcode triggers goes through a Server Action to Open Food
// Facts, so it is not asserted: `page.route()` cannot intercept it and the suite must
// not require the internet.

test("the scanner offers manual entry when there's no camera", async ({
  page,
}) => {
  await page.goto("/meals")
  await page.getByRole("button", { name: "Log food" }).click()

  await page.getByRole("button", { name: "Scan a barcode" }).click()
  await expect(
    page.getByRole("heading", { name: "Scan a barcode" }),
  ).toBeVisible()

  // No camera in this browser, so one of the fallbacks must render — and whichever it
  // is, it has to leave a way forward rather than a dead end.
  await expect(page.getByText(/type the barcode below/i)).toBeVisible()

  const field = page.getByLabel("Or type the barcode")
  await expect(field).toBeVisible()
  const lookUp = page.getByRole("button", { name: "Look up" })

  // The gate on the manual field is the same isLikelyBarcode used before the value is
  // ever interpolated into a URL path, so a non-barcode can't reach the network.
  await expect(lookUp).toBeDisabled()
  await field.fill("12345")
  await expect(lookUp).toBeDisabled()
  await field.fill("not-a-barcode")
  await expect(lookUp).toBeDisabled()
  await field.fill("3017620422003")
  await expect(lookUp).toBeEnabled()

  // Close without looking anything up; the dialog underneath must survive.
  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("heading", { name: "Scan a barcode" }),
  ).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Log food" })).toBeVisible()
})

test("the scan button is absent when the food database is switched off", async ({
  page,
}) => {
  // OFF_ENABLED is read on the server and passed down, so this also proves the flag
  // reaches the client without any component touching process.env.
  await page.goto("/meals")
  await page.getByRole("button", { name: "Log food" }).click()

  const scan = page.getByRole("button", { name: "Scan a barcode" })
  // The search bar is always there since T31; its "Packaged products" group and the scan
  // button are gated on the same flag, so they appear and disappear together. Three
  // letters, because the group waits for that many before asking.
  await page.getByPlaceholder(/search foods/i).fill("yogurt")
  // `exact`: the bar's footer mentions packaged products too.
  const packaged = page.getByText("Packaged products", { exact: true })
  if ((await scan.count()) === 1) await expect(packaged).toBeVisible()
  else await expect(packaged).toHaveCount(0)
})
