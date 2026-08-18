import { test, expect } from "./_test"

import { pageAction } from "./_menu"

// Browser coverage for T1-S6 meals capture: the NL quick-add bar, one-tap re-log, and the
// in-dialog food-search (Enter selects a food, does not submit the form).

const rows = (name: string) => `div.bg-card:has-text("${name}")`

test("NL bar logs an explicit-macro entry, and re-log duplicates it", async ({
  page,
}) => {
  const name = `e2emeal${Date.now()}`
  await page.goto("/meals")

  const bar = page.getByLabel("Quick add meal")
  await bar.fill(`${name} 600cal 40p 30c 10f`)
  await bar.press("Enter")

  const row = page.locator(rows(name))
  await expect(row.first()).toBeVisible()
  await page.screenshot({ path: "test-results/meals-capture.png" })

  // Re-log → a second identical copy.
  await row.first().getByRole("button", { name: "Log again" }).click()
  await expect(page.locator(rows(name))).toHaveCount(2)

  // Cleanup both.
  for (let remaining = 2; remaining > 0; remaining--) {
    const r = page.locator(rows(name)).first()
    await r.getByRole("button", { name: "Entry actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(page.locator(rows(name))).toHaveCount(remaining - 1)
  }
})

test("NL bar rejects unparseable input and keeps the text", async ({
  page,
}) => {
  await page.goto("/meals")
  const bar = page.getByLabel("Quick add meal")
  await bar.fill("xyzzy not a food")
  await bar.press("Enter")

  await expect(page.getByText(/parse that/i)).toBeVisible()
  await expect(bar).toHaveValue("xyzzy not a food")
})

test("food-search fills the form from a library food (Enter selects, no submit)", async ({
  page,
}) => {
  const food = `e2efood${Date.now()}`
  await page.goto("/meals")

  // Create a library food via the dialog (a typed new food defaults to save-to-library).
  await page.getByRole("button", { name: "Log food" }).click()
  await page.getByLabel("Food", { exact: true }).fill(food)
  await page.getByLabel("Serving", { exact: true }).fill("1 cup")
  await page.getByLabel("Calories", { exact: true }).fill("250")
  await page.getByRole("button", { name: "Log", exact: true }).click()
  await expect(page.locator(rows(food)).first()).toBeVisible()

  // Reopen → search → Enter selects the food and fills the form WITHOUT submitting.
  await page.getByRole("button", { name: "Log food" }).click()
  const search = page.getByPlaceholder(/search your foods/i)
  await search.fill(food)
  await search.press("Enter")
  await expect(page.getByLabel("Food", { exact: true })).toHaveValue(food)
  await expect(page.getByLabel("Calories", { exact: true })).toHaveValue("250")
  await expect(page.getByRole("heading", { name: "Log food" })).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()

  // Cleanup the logged entry.
  const r = page.locator(rows(food)).first()
  await r.getByRole("button", { name: "Entry actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(page.locator(rows(food))).toHaveCount(0)

  // Cleanup the library food too — it outlives the entry, so leaving it behind
  // grows the library by one row on every run and eventually pushes this
  // dialog's submit button past the bottom of the viewport.
  await pageAction(page, "Food library")
  const removeFood = page.getByRole("button", { name: `Delete ${food}` })
  await removeFood.click()
  await expect(removeFood).toHaveCount(0)
})

// T4-S1: `updateFood` shipped in Phase 2 with no caller at all, so the library was
// really create-read-delete. Editing must change the library row and leave already
// logged entries on their snapshot.
test("a library food can be edited, and past entries keep their snapshot", async ({
  page,
}) => {
  const food = `e2eedit${Date.now()}`
  await page.goto("/meals")

  await page.getByRole("button", { name: "Log food" }).click()
  await page.getByLabel("Food", { exact: true }).fill(food)
  await page.getByLabel("Serving", { exact: true }).fill("1 cup")
  await page.getByLabel("Calories", { exact: true }).fill("250")
  await page.getByRole("button", { name: "Log", exact: true }).click()
  const entry = page.locator(rows(food)).first()
  await expect(entry).toBeVisible()
  await expect(entry).toContainText("250 kcal")

  await pageAction(page, "Food library")
  await page.getByRole("button", { name: `Edit ${food}` }).click()
  await expect(page.getByLabel("Calories", { exact: true })).toHaveValue("250")
  await page.getByLabel("Calories", { exact: true }).fill("400")
  await page.getByRole("button", { name: `Save “${food}”` }).click()

  // Assert on the rendered library row rather than re-opening the form: saving
  // revalidates /meals, which re-mounts the list, and a second click would race it.
  await expect(page.locator("li").filter({ hasText: food })).toContainText(
    "400 kcal",
  )

  await page.keyboard.press("Escape")

  // The entry logged before the edit kept its own snapshot.
  await expect(entry).toContainText("250 kcal")

  // Order matters for cleanup: delete the ENTRY first, then the library food. Each
  // delete raises an undo toast in the bottom-right, and the entry rows are down
  // there too — doing it the other way round left the food's toast sitting over the
  // entry's actions button, which cost one intermittent failure before it was spotted.
  await entry.getByRole("button", { name: "Entry actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(page.locator(rows(food))).toHaveCount(0)

  await pageAction(page, "Food library")
  const removeFood = page.getByRole("button", { name: `Delete ${food}` })
  await removeFood.click()
  await expect(removeFood).toHaveCount(0)
})
