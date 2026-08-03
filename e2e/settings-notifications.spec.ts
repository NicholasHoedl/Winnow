import { test, expect, type Page } from "./_test"

// Browser coverage for T2-S5. The point of this spec is the CLOBBER guard: the
// Preferences and Notifications sections are separate forms over the same
// user_preferences row, each submitting its whole form. They must write only their
// own columns — otherwise saving one silently reverts the other's just-saved values.

function preferencesForm(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save preferences" }) })
}

function notificationsForm(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save notifications" }) })
}

test("saving notifications doesn't revert regional preferences", async ({
  page,
}) => {
  await page.goto("/settings")

  const prefs = preferencesForm(page)
  const notifs = notificationsForm(page)

  // Remember what to restore at the end.
  const wasDigestOn =
    (await notifs
      .getByRole("button", { name: "On", exact: true })
      .getAttribute("aria-pressed")) === "true"
  const was24Hour =
    (await prefs
      .getByRole("button", { name: "24-hour" })
      .getAttribute("aria-pressed")) === "true"

  const nextTimeFormat = was24Hour ? "12-hour" : "24-hour"
  const nextDigest = wasDigestOn ? "Off" : "On"

  // 1. Flip a regional preference and save it.
  await prefs.getByRole("button", { name: nextTimeFormat }).click()
  await prefs.getByRole("button", { name: "Save preferences" }).click()
  await expect(page.getByText("Preferences saved")).toBeVisible()

  // 2. Now flip the digest and save the OTHER form.
  await notifs.getByRole("button", { name: nextDigest, exact: true }).click()
  await notifs.getByRole("button", { name: "Save notifications" }).click()
  await expect(page.getByText("Notification settings saved")).toBeVisible()

  // 3. Both must have survived the round trip.
  await page.reload()
  await expect(
    preferencesForm(page).getByRole("button", { name: nextTimeFormat }),
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    notificationsForm(page).getByRole("button", {
      name: nextDigest,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true")

  // Restore both to how we found them.
  await preferencesForm(page)
    .getByRole("button", { name: was24Hour ? "24-hour" : "12-hour" })
    .click()
  await preferencesForm(page)
    .getByRole("button", { name: "Save preferences" })
    .click()
  await expect(page.getByText("Preferences saved")).toBeVisible()

  await notificationsForm(page)
    .getByRole("button", { name: wasDigestOn ? "On" : "Off", exact: true })
    .click()
  await notificationsForm(page)
    .getByRole("button", { name: "Save notifications" })
    .click()
  await expect(page.getByText("Notification settings saved")).toBeVisible()
})
