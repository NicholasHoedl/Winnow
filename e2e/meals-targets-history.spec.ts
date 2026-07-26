import { test, expect } from "@playwright/test"

// Browser coverage for T4-S8, and the reason the whole step exists: macro_targets used
// to hold ONE row per user, so raising your calorie goal silently re-scored every day
// you had ever logged. Targets are now effective-dated, and a past day keeps whatever
// was in effect then.
//
// The seeded install has a period backfilled to 1970-01-01 by migration 0017, which is
// what makes "the past" well-defined here without the spec creating one.

// A per-run day, plus a per-run calorie figure. The date alone is NOT enough isolation
// here, and that difference is worth stating: a target period applies FORWARD from its
// start date, so a period left behind by a failed run governs every later day — unlike
// a meal entry, which only ever affects the one day it sits on. The distinctive value is
// what makes the assertions immune to leftovers; the sweep below stops them piling up.
const PAST = new Date(Date.UTC(2016, 0, 1) + (Date.now() % 2000) * 86_400_000)
  .toISOString()
  .slice(0, 10)
// The new period starts a day later, so PAST is strictly before it.
const NEWER = new Date(Date.parse(PAST) + 86_400_000).toISOString().slice(0, 10)
const CALORIES = String(3000 + (Date.now() % 900))

/** Remove every period except the backfilled one, so a prior failure can't skew this. */
async function clearAddedPeriods(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Set targets" }).click()
  for (;;) {
    const extra = page
      .getByRole("button", { name: /^Delete targets from / })
      .filter({ hasNot: page.locator("[data-never]") })
    const labels = await extra.evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("aria-label") ?? ""),
    )
    const target = labels.find((l) => !l.endsWith("1970-01-01"))
    if (!target) break
    await page.getByRole("button", { name: target, exact: true }).click()
    await expect(
      page.getByRole("button", { name: target, exact: true }),
    ).toHaveCount(0)
  }
  await page.keyboard.press("Escape")
}

test("a new target period leaves earlier days on their old targets", async ({
  page,
}) => {
  await page.goto(`/meals?date=${PAST}`)
  await clearAddedPeriods(page)

  const summary = page.locator("div.rounded-xl.border").first()
  await expect(summary).toContainText("Calories")

  // Open a period starting the day AFTER the one we're looking at.
  await page.getByRole("button", { name: "Set targets" }).click()
  await page.getByLabel("Applies from").fill(NEWER)
  await page.getByLabel("Calories").fill(CALORIES)
  await page.getByRole("button", { name: "Save", exact: true }).click()

  // The assertion the whole step exists for: the earlier day never adopts the new
  // figure. Deliberately NOT a before/after text snapshot — that races the revalidation
  // the save triggers, and the invariant is about this value specifically, not about
  // the panel being byte-identical.
  await expect(summary).not.toContainText(CALORIES)
  // …and it still has targets at all, rather than falling through to "untracked".
  await expect(summary).toContainText("Calories")

  // …and the later day picks the new period up.
  await page.goto(`/meals?date=${NEWER}`)
  await expect(summary).toContainText(CALORIES)

  // Removing the period hands the later day back to the earlier targets.
  await page.getByRole("button", { name: "Set targets" }).click()
  await page
    .getByRole("button", { name: `Delete targets from ${NEWER}` })
    .click()
  await page.keyboard.press("Escape")
  await expect(summary).not.toContainText(CALORIES)
})
