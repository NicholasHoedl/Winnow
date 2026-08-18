import { test, expect } from "./_test"

import { pageAction } from "./_menu"

import { visibleCard } from "./_card"

// Browser coverage for T4-S9. Two things, and the second is the one that was actually
// broken rather than merely missing:
//
//   1. Exceeding a target is visible — the percentage and the bar turn destructive.
//   2. The percentage a screen reader gets is the REAL one. The bar's width must be
//      clamped at 100% or it overflows its track, and base-ui derives aria-valuenow
//      from that clamped value — so before this step a 127% day was announced as 100%.
//
// Runs on a per-run past day with its own target period, since the assertion depends on
// the day's totals and on which targets apply to it.
const DAY = new Date(Date.UTC(2014, 0, 1) + (Date.now() % 1500) * 86_400_000)
  .toISOString()
  .slice(0, 10)

test("going past a target is shown, and announced truthfully", async ({
  page,
}) => {
  const name = `e2eover${Date.now()}`
  const row = visibleCard(page, name)
  const summary = page.locator("div.rounded-xl.border").first()

  await page.goto(`/meals?date=${DAY}`)

  // A small target starting on this day, so the period applies here and nowhere earlier.
  await pageAction(page, "Set targets")
  await page.getByLabel("Applies from").fill(DAY)
  await page.getByLabel("Calories").fill("1000")
  await page.getByRole("button", { name: "Save", exact: true }).click()

  // Log well past it: 1500 of 1000 kcal = 150%.
  await page.getByRole("button", { name: "Log food" }).click()
  await page.getByLabel("Food", { exact: true }).fill(name)
  await page.getByLabel("Serving", { exact: true }).fill("1 plate")
  await page.getByLabel("Calories", { exact: true }).fill("1500")
  await page.getByRole("checkbox", { name: /save as a new food/i }).uncheck()
  await page.getByRole("button", { name: "Log", exact: true }).click()
  await expect(row).toBeVisible()

  // The true figure is on screen, not a capped one.
  await expect(summary).toContainText("150%")

  // And it's styled as over-target rather than looking like any other day.
  const percent = summary.locator("span", { hasText: /^150%$/ }).first()
  await expect(percent).toHaveClass(/text-destructive/)

  // The clamped bar must be out of the accessibility tree entirely — otherwise it
  // contributes a progressbar announcing 100% and contradicts the text above it.
  const bars = summary.locator('[data-slot="progress"]')
  expect(await bars.count()).toBeGreaterThan(0)
  for (const bar of await bars.all()) {
    await expect(bar).toHaveAttribute("aria-hidden", "true")
  }
  await expect(summary.getByRole("progressbar")).toHaveCount(0)

  // Cleanup: entry, then the target period.
  await row.getByRole("button", { name: "Entry actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row).toHaveCount(0)
  await page.reload()
  await pageAction(page, "Set targets")
  const remove = page.getByRole("button", {
    name: `Delete targets from ${DAY}`,
  })
  await remove.click()
  await expect(remove).toHaveCount(0)
})
