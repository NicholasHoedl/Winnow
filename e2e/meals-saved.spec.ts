import { test, expect, type Page } from "./_test"

import { pageAction } from "./_menu"

// Browser coverage for T32 (ADR-0026): a section of the day's log becomes a saved meal,
// the meal's chip logs every item in one tap with an undo, and the list edits and deletes
// it — the delete with an undo too.
//
// The entries are quick-added with explicit calories and no library food, so nothing here
// touches the food library: an item without a library food is the snapshot-only case, and
// the reference-food fall-through with its library cleanup belongs to
// `meals-food-search.spec.ts`.

const rows = (name: string) => `div.bg-card:has-text("${name}")`
const stamp = Date.now()
const FOOD_A = `e2esma${stamp}`
const FOOD_B = `e2esmb${stamp}`
const MEAL = `e2e meal ${stamp}`

/** The meal's chip in the saved-meals strip — the group keeps it apart from the food chips. */
function chip(page: Page) {
  return page
    .getByRole("group", { name: "Saved meals" })
    .getByRole("button", { name: new RegExp(`^${MEAL}`) })
}

/** The section of the day's log headed `label`. */
function section(page: Page, label: string) {
  return page.locator("section", {
    has: page.getByRole("heading", { name: label, exact: true }),
  })
}

async function quickAdd(page: Page, text: string, name: string) {
  const before = await page.locator(rows(name)).count()
  const bar = page.getByLabel("Quick add meal")
  await bar.fill(text)
  await bar.press("Enter")
  await expect(page.locator(rows(name))).toHaveCount(before + 1)
}

async function deleteEntries(page: Page, name: string) {
  for (let i = 0; i < 6; i++) {
    const entries = page.locator(rows(name))
    const count = await entries.count()
    if (count === 0) break
    await entries.first().getByRole("button", { name: "Entry actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(entries).toHaveCount(count - 1)
  }
}

/**
 * Remove the meal and the entries, in `afterEach` so a failing assertion cannot leave a
 * chip on the page for the next spec — the strip renders whenever a meal exists.
 */
test.afterEach(async ({ page }) => {
  await page.goto("/meals")
  await pageAction(page, "Saved meals")
  const remove = page.getByRole("button", { name: `Delete ${MEAL}` })
  if ((await remove.count()) > 0) {
    await remove.first().click()
    await expect(remove).toHaveCount(0)
  }
  await page.keyboard.press("Escape")
  await deleteEntries(page, FOOD_A)
  await deleteEntries(page, FOOD_B)
})

test("a breakfast becomes a saved meal, and its chip logs both foods in one tap", async ({
  page,
}) => {
  await page.goto("/meals")
  await quickAdd(page, `breakfast ${FOOD_A} 100cal`, FOOD_A)
  await quickAdd(page, `breakfast ${FOOD_B} 50cal`, FOOD_B)

  // The section's heading offers to save what is under it, pre-filled.
  const breakfast = section(page, "Breakfast")
  await breakfast.getByRole("button", { name: "Save as meal" }).click()
  const editor = page.getByRole("dialog", { name: "Save as meal" })
  await expect(editor.getByLabel("Name")).toHaveValue("Breakfast")
  await expect(editor.getByText(FOOD_A)).toBeVisible()
  await expect(editor.getByText(FOOD_B)).toBeVisible()
  await expect(editor).toContainText("Total 150 kcal")

  await editor.getByLabel("Name").fill(MEAL)
  await editor.getByRole("button", { name: "Save meal" }).click()
  await expect(editor).toHaveCount(0)

  // The chip carries the meal's total.
  await expect(chip(page)).toBeVisible()
  await expect(chip(page)).toContainText("150 kcal")

  // One tap logs both foods into the breakfast section…
  await chip(page).click()
  await expect(page.getByText(`Logged ${MEAL}`)).toBeVisible()
  await expect(page.locator(rows(FOOD_A))).toHaveCount(2)
  await expect(page.locator(rows(FOOD_B))).toHaveCount(2)
  await expect(breakfast).toContainText("300 kcal")

  // …and Undo takes out exactly those two, leaving the originals.
  await page.getByRole("button", { name: "Undo" }).click()
  await expect(page.locator(rows(FOOD_A))).toHaveCount(1)
  await expect(page.locator(rows(FOOD_B))).toHaveCount(1)
})

test("the list edits a serving, and a deleted meal comes back with undo", async ({
  page,
}) => {
  await page.goto("/meals")
  await quickAdd(page, `lunch ${FOOD_A} 100cal`, FOOD_A)

  await section(page, "Lunch")
    .getByRole("button", { name: "Save as meal" })
    .click()
  const editor = page.getByRole("dialog", { name: "Save as meal" })
  await editor.getByLabel("Name").fill(MEAL)
  await editor.getByRole("button", { name: "Save meal" }).click()
  await expect(editor).toHaveCount(0)
  await expect(chip(page)).toContainText("100 kcal")

  // Edit from the list: two servings doubles the total, and the chip follows.
  await pageAction(page, "Saved meals")
  const list = page.getByRole("dialog", { name: "Saved meals" })
  await expect(list).toContainText("1 food · 100 kcal · Lunch")
  await list.getByRole("button", { name: `Edit ${MEAL}` }).click()
  const edit = page.getByRole("dialog", { name: "Edit saved meal" })
  await edit.getByLabel(`Servings of ${FOOD_A}`).fill("2")
  await expect(edit).toContainText("Total 200 kcal")
  await edit.getByRole("button", { name: "Save meal" }).click()
  await expect(edit).toHaveCount(0)
  await expect(chip(page)).toContainText("200 kcal")

  // Delete from the list, close it, undo from the toast: the meal is back, servings and all.
  await pageAction(page, "Saved meals")
  await list.getByRole("button", { name: `Delete ${MEAL}` }).click()
  await expect(
    list.getByRole("button", { name: `Delete ${MEAL}` }),
  ).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(chip(page)).toHaveCount(0)
  await page.getByRole("button", { name: "Undo" }).click()
  await expect(chip(page)).toContainText("200 kcal")
  await pageAction(page, "Saved meals")
  await expect(list).toContainText("1 food · 200 kcal · Lunch")
  await page.keyboard.press("Escape")
})
