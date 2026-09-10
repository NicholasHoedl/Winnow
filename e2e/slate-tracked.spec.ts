import { test, expect, type Page } from "./_test"

import { deleteEventsMatching } from "./_events"

// The one thing in T16 that spans three modules: flag an event on /calendar, and it reaches
// the dashboard — but only from inside the horizon that /settings owns. Neither module can be
// tested into proving that on its own, which is the whole reason this file exists rather than
// an assertion bolted onto `calendar.spec.ts`.
//
// T28 renamed the flag from "highlight" to "track" and made it the ONLY way onto the Slate:
// before it, today's and tomorrow's events were drawn whether flagged or not, so the card was
// a second calendar. The untracked event on today's date below is the new negative — the
// four-days-out one proved nothing about today.
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

// Four days out: inside a 1-week horizon but outside a 3-day one.
const DAY = inDays(4)
const TODAY = inDays(0)

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
  return page.getByRole("group", { name: "Tracked events show" })
}

async function setHorizon(page: Page, label: string) {
  await page.goto("/settings/defaults")
  await horizon(page).getByRole("button", { name: label, exact: true }).click()
  await page.getByRole("button", { name: "Save defaults" }).click()
  await expect(page.getByText("Defaults saved")).toBeVisible()
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

async function addEvent(
  page: Page,
  title: string,
  tracked: boolean,
  day: string,
) {
  await page.getByRole("button", { name: "Add event" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title").fill(title)
  // BOTH ends, not just the start. The dialog opens on today, and leaving "Ends" there
  // would make a four-day span that renders on today as well — which would quietly
  // destroy the control assertion below without failing anything visible.
  await dialog.getByLabel("Starts").fill(day)
  await dialog.getByLabel("Ends").fill(day)
  if (tracked) {
    // By role, not label: base-ui renders a visual span AND a hidden input, so getByLabel
    // matches two nodes and strict mode rejects it. Same note as `calendar-week.spec.ts`.
    await dialog
      .getByRole("checkbox", { name: "Track on the dashboard" })
      .check()
  }
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

// All three fixtures, from the database. Clicking them away meant pinning `?view=day` by
// URL, because the month grid does not hold an event four days out in the last days of a
// month and the view preference is itself something this suite changes — neither of which
// a `delete` has to know about.
test.afterEach(async () => {
  for (const prefix of ["E2E tracked", "E2E plain"])
    await deleteEventsMatching(prefix)
})

test("a tracked event reaches the dashboard from inside the horizon, and an untracked one never does", async ({
  page,
}) => {
  const stamp = Date.now()
  const tracked = `E2E tracked ${stamp}`
  const plain = `E2E plain ${stamp}`
  // Hyphenated so `getByText(plain)` cannot match it as a substring.
  const plainToday = `E2E plain-today ${stamp}`

  await page.goto("/settings/defaults")
  const was = await selectedHorizon(page)
  await setHorizon(page, "1 week")

  await page.goto(`/calendar?view=day&date=${DAY}`)
  await addEvent(page, tracked, true, DAY)
  await addEvent(page, plain, false, DAY)
  await expect(
    page.getByRole("button", { name: new RegExp(tracked) }),
  ).toHaveCount(1)

  await page.goto(`/calendar?view=day&date=${TODAY}`)
  await addEvent(page, plainToday, false, TODAY)
  await expect(
    page.getByRole("button", { name: new RegExp(plainToday) }),
  ).toHaveCount(1)

  const slate = page.getByRole("region", { name: "Slate" })

  await page.goto("/")
  await expect(slate.getByText(tracked)).toBeVisible()
  // The controls are the load-bearing half. Without the first this passes just as well
  // against a Slate that shows every event out to the horizon and ignores the flag; without
  // the second, against the pre-T28 Slate that drew all of today regardless.
  await expect(slate.getByText(plain)).toHaveCount(0)
  await expect(slate.getByText(plainToday)).toHaveCount(0)

  // --- Narrow the horizon and the same event drops off. Nothing about the event changed;
  // only how far ahead the dashboard is willing to look.
  await setHorizon(page, "3 days")
  await page.goto("/")
  await expect(slate.getByText(tracked)).toHaveCount(0)

  // --- The setting back where it was found. The events go in `afterEach`, which also
  // covers the case this cannot: an assertion above throwing before we reach here.
  await setHorizon(page, was)
})
