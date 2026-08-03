import { test, expect } from "./_test"

import { visibleCard } from "./_card"

// Browser coverage for T4-S10: duplicating a day, and undoing it.
//
// Two per-run days (a source and the day after it) so the counts can't be disturbed by
// a previous run's leftovers — the source day's entries are what gets copied, so a stray
// entry there would change how many rows appear on the destination.
const SOURCE = new Date(Date.UTC(2012, 0, 1) + (Date.now() % 1200) * 86_400_000)
  .toISOString()
  .slice(0, 10)
const DEST = new Date(Date.parse(SOURCE) + 86_400_000)
  .toISOString()
  .slice(0, 10)

test("a day can be copied onto another, and the copy undone", async ({
  page,
}) => {
  const stamp = Date.now()
  const first = `e2ecopyA${stamp}`
  const second = `e2ecopyB${stamp}`
  const rows = (name: string) => visibleCard(page, name)

  // --- Two entries on the source day.
  await page.goto(`/meals?date=${SOURCE}`)
  for (const [name, calories] of [
    [first, "410"],
    [second, "250"],
  ] as const) {
    await page.getByRole("button", { name: "Log food" }).click()
    await page.getByLabel("Food", { exact: true }).fill(name)
    await page.getByLabel("Serving", { exact: true }).fill("1 plate")
    await page.getByLabel("Calories", { exact: true }).fill(calories)
    await page.getByRole("checkbox", { name: /save as a new food/i }).uncheck()
    await page.getByRole("button", { name: "Log", exact: true }).click()
    await expect(rows(name)).toHaveCount(1)
  }

  // --- Copy them onto the next day.
  await page.goto(`/meals?date=${DEST}`)
  await expect(rows(first)).toHaveCount(0)
  await page.getByRole("button", { name: "Copy a day" }).click()
  await page.getByLabel("Copy from").fill(SOURCE)
  await page.getByRole("button", { name: "Copy", exact: true }).click()

  await expect(rows(first)).toHaveCount(1)
  await expect(rows(second)).toHaveCount(1)
  // The snapshot travels with the copy rather than being recalculated.
  await expect(rows(first)).toContainText("410 kcal")

  // --- Undo removes exactly what the copy added.
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(rows(first)).toHaveCount(0)
  await expect(rows(second)).toHaveCount(0)

  // …and the source day is untouched throughout — a copy is not a move.
  await page.goto(`/meals?date=${SOURCE}`)
  await expect(rows(first)).toHaveCount(1)
  await expect(rows(second)).toHaveCount(1)

  // Cleanup, with a reload between deletes so the undo toast can't cover the next row.
  for (const name of [first, second]) {
    await rows(name).getByRole("button", { name: "Entry actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(rows(name)).toHaveCount(0)
    await page.reload()
  }
})
