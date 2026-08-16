import { test, expect, type Page } from "./_test"

// The one thing in T16 that spans three modules: flag an event on /calendar, and it reaches
// back from its own day to the dashboard — but only from inside the horizon that /settings
// owns. Neither module can be tested into proving that on its own, which is the whole reason
// this file exists rather than an assertion bolted onto `calendar.spec.ts`.
//
// The setting is RESTORED at the end. The suite runs serially against one database, so a
// horizon left at 3 silently retunes every later dashboard assertion;
// `settings-defaults.spec.ts` and `goal-momentum.spec.ts` carry the same warning.

/** ISO date `n` days from today, in the browser's zone — the one the app renders in. */
function inDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const pad = (v: number) => String(v).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Four days out: past tomorrow, which shows everything regardless of the flag and so would
// prove nothing, and inside a 1-week horizon but outside a 3-day one.
const DAY = inDays(4)

/**
 * The horizon control, by its own accessible name.
 *
 * Not the whole form: the goal-momentum window sits in it too and offers "1 week" and
 * "2 weeks" as well, so a form-scoped lookup matches two buttons and strict mode rejects it.
 * `Segmented` takes a required `label` for exactly this reason — before T16 the group had no
 * accessible name, which made the two controls indistinguishable to a screen reader as much
 * as to this locator.
 */
function horizon(page: Page) {
  return page.getByRole("group", { name: "Highlighted events show" })
}

async function setHorizon(page: Page, label: string) {
  await page.goto("/settings")
  await horizon(page).getByRole("button", { name: label, exact: true }).click()
  await page.getByRole("button", { name: "Save preferences" }).click()
  await expect(page.getByText("Preferences saved")).toBeVisible()
}

/** The label of whichever horizon option is currently selected. */
async function selectedHorizon(page: Page): Promise<string> {
  for (const name of ["3 days", "1 week", "2 weeks"]) {
    const pressed = await horizon(page)
      .getByRole("button", { name, exact: true })
      .getAttribute("aria-pressed")
    if (pressed === "true") return name
  }
  throw new Error("No horizon option is selected")
}

async function addEvent(page: Page, title: string, highlighted: boolean) {
  await page.getByRole("button", { name: "Add event" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title").fill(title)
  // BOTH ends, not just the start. The dialog opens on today, and leaving "Ends" there
  // would make this a four-day span that renders on today as well — which would quietly
  // destroy the control assertion below without failing anything visible.
  await dialog.getByLabel("Starts").fill(DAY)
  await dialog.getByLabel("Ends").fill(DAY)
  if (highlighted) {
    // By role, not label: base-ui renders a visual span AND a hidden input, so getByLabel
    // matches two nodes and strict mode rejects it. Same note as `calendar-week.spec.ts`.
    await dialog
      .getByRole("checkbox", { name: "Highlight on the dashboard" })
      .check()
  }
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

async function deleteEvent(page: Page, title: string) {
  // Day view, pinned by URL: the month grid would not hold this event at all in the last
  // few days of a month, and `?view=` overrides whatever the view preference happens to be.
  await page.goto(`/calendar?view=day&date=${DAY}`)
  const chip = page.getByRole("button", { name: new RegExp(title) })
  await chip.first().click()
  await page.getByRole("button", { name: "Delete" }).click()
  await expect(chip).toHaveCount(0)
}

test("a highlighted event reaches the dashboard from inside the horizon", async ({
  page,
}) => {
  const stamp = Date.now()
  const flagged = `E2E highlight ${stamp}`
  const plain = `E2E plain ${stamp}`

  await page.goto("/settings")
  const was = await selectedHorizon(page)
  await setHorizon(page, "1 week")

  await page.goto(`/calendar?view=day&date=${DAY}`)
  await addEvent(page, flagged, true)
  await addEvent(page, plain, false)
  await expect(
    page.getByRole("button", { name: new RegExp(flagged) }),
  ).toHaveCount(1)

  const slate = page.getByRole("region", { name: "Slate" })

  await page.goto("/")
  await expect(slate.getByText(flagged)).toBeVisible()
  // The control is the load-bearing half. Without it this passes just as well against a
  // Slate that shows every event out to the horizon and ignores the flag entirely — days
  // 2..N carrying ONLY flagged events is the whole reason the flag is worth having.
  await expect(slate.getByText(plain)).toHaveCount(0)

  // --- Narrow the horizon and the same event drops off. Nothing about the event changed;
  // only how far ahead the dashboard is willing to look.
  await setHorizon(page, "3 days")
  await page.goto("/")
  await expect(slate.getByText(flagged)).toHaveCount(0)

  // --- Cleanup, then the setting back where it was found.
  await deleteEvent(page, flagged)
  await deleteEvent(page, plain)
  await setHorizon(page, was)
})
