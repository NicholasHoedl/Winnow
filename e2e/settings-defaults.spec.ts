import { test, expect, type Page } from "./_test"

// Two preferences that change what another page DOES, rather than how it formats something:
// `defaultCalendarView` decides which view `/calendar` opens on, and `balanceMacroTargets`
// decides whether saving macro targets derives carbs from the other three.
//
// Both are covered here rather than in the calendar/meals specs on purpose. The thing worth
// asserting is the round trip — settings writes it, another page reads it — and splitting
// that across two files leaves neither one testing the link.
//
// Every test restores what it found. The suite runs serially against one database, so a
// preference left flipped silently retunes every later assertion; `goal-momentum.spec.ts`
// carries the same warning for the same reason.

function preferencesForm(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save preferences" }) })
}

async function savePreferences(page: Page) {
  await preferencesForm(page)
    .getByRole("button", { name: "Save preferences" })
    .click()
  await expect(page.getByText("Preferences saved")).toBeVisible()
}

/**
 * One `Segmented` control, by its accessible name.
 *
 * Scoped to the GROUP rather than to the form, which is the whole reason `Segmented` takes a
 * required `label` and renders `role="group"` + `aria-label`. Two preferences may legitimately
 * offer the same option words — `goalMomentumDays` and `slateHorizonDays` both say "1 week",
 * and `defaultCalendarView` and `dashboardCalendarView` both say "Month" — so a form-scoped
 * `getByRole("button", { name: "Month" })` is a strict-mode violation waiting for the next
 * preference to be added. It waited for exactly that and then fired.
 *
 * **`exact: true` is load-bearing on the GROUP too**, not just on the buttons. Playwright
 * matches an accessible name by SUBSTRING by default, and the labels here are one another's
 * prefixes: "Dashboard calendar opens on" contains "Calendar opens on", so the un-exact
 * lookup resolved to both controls and failed identically to the form-scoped version it
 * replaced. Scoping fixed the wrong half first.
 */
function segmented(page: Page, label: string) {
  return preferencesForm(page).getByRole("group", { name: label, exact: true })
}

/** The label of whichever option in `names` is currently selected, within one control. */
async function selected(
  page: Page,
  label: string,
  names: string[],
): Promise<string> {
  for (const name of names) {
    const pressed = await segmented(page, label)
      .getByRole("button", { name, exact: true })
      .getAttribute("aria-pressed")
    if (pressed === "true") return name
  }
  throw new Error(`None of ${names.join(", ")} is selected in ${label}`)
}

test("the calendar opens on the view you chose", async ({ page }) => {
  await page.goto("/settings")
  const was = await selected(page, "Calendar opens on", [
    "Month",
    "Week",
    "Day",
    "Agenda",
  ])

  await segmented(page, "Calendar opens on")
    .getByRole("button", { name: "Week", exact: true })
    .click()
  await savePreferences(page)

  // A BARE /calendar — no `?view=`. This is the whole feature: what the URL doesn't say,
  // the preference answers.
  await page.goto("/calendar")
  await expect(
    page.getByRole("link", { name: "week", exact: true }),
  ).toHaveAttribute("aria-current", "page")

  // …and an explicit view still wins, so a bookmark or a shared link means what it always
  // meant regardless of whose preference is in play.
  await page.goto("/calendar?view=day")
  await expect(
    page.getByRole("link", { name: "day", exact: true }),
  ).toHaveAttribute("aria-current", "page")

  // The month button has to be able to select the month. Before T14 `calendarHref` omitted
  // `view=month`, which with a week preference produced a link that resolved straight back
  // to the week — the one view you could not reach from the switcher.
  await page.goto("/calendar")
  await page.getByRole("link", { name: "month", exact: true }).click()
  await expect(page).toHaveURL(/view=month/)
  await expect(
    page.getByRole("link", { name: "month", exact: true }),
  ).toHaveAttribute("aria-current", "page")

  await page.goto("/settings")
  await segmented(page, "Calendar opens on")
    .getByRole("button", { name: was, exact: true })
    .click()
  await savePreferences(page)
})

test("balancing derives carbs from calories, protein and fat", async ({
  page,
}) => {
  const DATE = "2019-04-01" // Far enough back to own its own target period.

  await page.goto("/settings")
  // Scoped to its own control for the same reason as the calendar test above: "On" / "Off"
  // are the least distinctive option words in the whole form, and are one addition away from
  // colliding with something.
  const balance = segmented(page, "Balance macro targets")
  const wasOn =
    (await balance
      .getByRole("button", { name: "On", exact: true })
      .getAttribute("aria-pressed")) === "true"

  await balance.getByRole("button", { name: "On", exact: true }).click()
  await savePreferences(page)

  await page.goto(`/meals?date=${DATE}`)
  await page.getByRole("button", { name: "Set targets" }).click()

  // 2000 = 150*4 + c*4 + 60*9  ->  c = (2000 - 600 - 540) / 4 = 215
  await page.getByLabel("Applies from").fill(DATE)
  await page.getByLabel("Calories").fill("2000")
  await page.getByLabel("Protein (g)").fill("150")
  await page.getByLabel("Fat (g)").fill("60")

  // Computed live, before saving, and not typed by the test — the field is read-only.
  const carbs = page.getByLabel("Carbs (g)")
  await expect(carbs).toHaveValue("215")
  await expect(carbs).toHaveAttribute("readonly", "")

  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText(/carbs set to 215 g/)).toBeVisible()

  // Protein and fat alone exceeding the calories is refused rather than clamped to 0 —
  // clamping would store a row whose parts exceed its whole, and carbs of 0 means
  // "untracked" everywhere else.
  await page.getByRole("button", { name: "Set targets" }).click()
  await page.getByLabel("Applies from").fill(DATE)
  await page.getByLabel("Calories").fill("500")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText(/Raise calories to at least/)).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()

  // With it off, carbs is yours to type again.
  await page.goto("/settings")
  await segmented(page, "Balance macro targets")
    .getByRole("button", { name: "Off", exact: true })
    .click()
  await savePreferences(page)

  await page.goto(`/meals?date=${DATE}`)
  await page.getByRole("button", { name: "Set targets" }).click()
  await expect(page.getByLabel("Carbs (g)")).not.toHaveAttribute("readonly", "")
  await page.getByRole("button", { name: "Cancel" }).click()

  // Clean up: remove the period this test created, then put the preference back.
  await page.getByRole("button", { name: "Set targets" }).click()
  const row = page
    .locator("li")
    .filter({ hasText: /From 1 Apr 2019/ })
    .first()
  if (await row.isVisible()) {
    await row.getByRole("button", { name: /^Delete targets from/ }).click()
    await expect(row).toHaveCount(0)
  }
  await page.getByRole("button", { name: "Cancel" }).click()

  if (wasOn) {
    await page.goto("/settings")
    await segmented(page, "Balance macro targets")
      .getByRole("button", { name: "On", exact: true })
      .click()
    await savePreferences(page)
  }
})
