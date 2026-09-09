import { test, expect, type Locator, type Page } from "./_test"

// Browser coverage for T2-S5: the CLOBBER guard. Defaults and Notifications are separate
// forms over the same user_preferences row, each submitting its whole form. They must write
// only their own columns — otherwise saving one silently reverts the other's just-saved
// values.
//
// The sentinel used to be the time format. That is a REGION field now, on a page of its own
// since Settings was split by subject, so the two forms this spec pits against each other
// are the two that still share a page: Defaults and Notifications, on /settings/defaults.
// The Region-versus-Defaults case is not tested here on purpose — the two schemas are
// asserted disjoint in `preferences/validation.test.ts`, and every action writes exactly
// the keys its schema parses, so a cross-page clobber cannot regress without that unit
// test going red first.

function defaultsForm(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save defaults" }) })
}

function notificationsForm(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save notifications" }) })
}

/**
 * The pressed option in one `Segmented` control, and any other option in it.
 *
 * Read off the control rather than hard-coded: this spec is about whether a value survives
 * another form's save, not about what the options are called, and naming them would make a
 * test about clobbering fail on a copy change.
 */
async function pressedAndOther(
  group: Locator,
): Promise<{ was: string; next: string }> {
  const buttons = group.getByRole("button")
  const names = await buttons.allInnerTexts()
  const states = await Promise.all(
    names.map((_, i) => buttons.nth(i).getAttribute("aria-pressed")),
  )
  const was = names[states.indexOf("true")]
  const next = names.find((name) => name !== was)
  if (!was || !next) {
    throw new Error("expected a pressed option and an alternative")
  }
  return { was, next }
}

test("saving notifications doesn't revert the defaults", async ({ page }) => {
  await page.goto("/settings/defaults")

  const prefs = defaultsForm(page)
  const notifs = notificationsForm(page)
  // `exact` on the group, as on every Segmented lookup in this suite: labels here are one
  // another's prefixes, and a substring match resolves to more than one control.
  const priority = () =>
    defaultsForm(page).getByRole("group", {
      name: "Default task priority",
      exact: true,
    })

  // Remember what to restore at the end.
  const wasDigestOn =
    (await notifs
      .getByRole("button", { name: "On", exact: true })
      .getAttribute("aria-pressed")) === "true"
  const { was: wasPriority, next: nextPriority } =
    await pressedAndOther(priority())
  const nextDigest = wasDigestOn ? "Off" : "On"

  // 1. Flip a default and save it.
  await priority()
    .getByRole("button", { name: nextPriority, exact: true })
    .click()
  await prefs.getByRole("button", { name: "Save defaults" }).click()
  await expect(page.getByText("Defaults saved")).toBeVisible()

  // 2. Now flip the digest and save the OTHER form.
  await notifs.getByRole("button", { name: nextDigest, exact: true }).click()
  await notifs.getByRole("button", { name: "Save notifications" }).click()
  await expect(page.getByText("Notification settings saved")).toBeVisible()

  // 3. Both must have survived the round trip.
  await page.reload()
  await expect(
    priority().getByRole("button", { name: nextPriority, exact: true }),
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    notificationsForm(page).getByRole("button", {
      name: nextDigest,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true")

  // Restore both to how we found them.
  await priority()
    .getByRole("button", { name: wasPriority, exact: true })
    .click()
  await defaultsForm(page)
    .getByRole("button", { name: "Save defaults" })
    .click()
  await expect(page.getByText("Defaults saved")).toBeVisible()

  await notificationsForm(page)
    .getByRole("button", { name: wasDigestOn ? "On" : "Off", exact: true })
    .click()
  await notificationsForm(page)
    .getByRole("button", { name: "Save notifications" })
    .click()
  await expect(page.getByText("Notification settings saved")).toBeVisible()
})
