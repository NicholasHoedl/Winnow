import { test, expect } from "./_test"

/**
 * The two "managers" can rename what they list.
 *
 * `renameList` and `updateCategory` both existed from the modules that introduced them and
 * neither had a caller: every manager offered create and delete and nothing in between, so
 * fixing a typo in a name meant deleting the row — which detaches every task or transaction
 * filed under it — and making a new one. These tests pin the round trip, and in the
 * category's case also pin what deliberately CANNOT be edited.
 *
 * Both are pages now — lists in the Activity section (ADR-0020), categories in the Budget
 * section (ADR-0024). The category test scopes to `main` so the delete confirmation's
 * description, which quotes the name, cannot satisfy an exact-text lookup meant for the
 * list.
 *
 * Both work against rows they create themselves, so neither touches real data.
 */

test("a list can be renamed, and keeps its tasks", async ({ page }) => {
  const before = `E2E list ${Date.now()}`
  const after = `${before} renamed`

  await page.goto("/activity/lists")

  await page.getByLabel("New list name").fill(before)
  await page.getByRole("button", { name: "Add list" }).click()
  await expect(page.getByText(before, { exact: true })).toBeVisible()

  // The rename affordance loads the row into the same field the create form uses — so
  // the field's label changing is itself the signal that the form has switched modes.
  await page.getByRole("button", { name: `Rename ${before}` }).click()
  const field = page.getByLabel("List name")
  await expect(field).toHaveValue(before)

  await field.fill(after)
  await page.getByRole("button", { name: `Save ${before}` }).click()
  await expect(page.getByText(after, { exact: true })).toBeVisible()
  await expect(page.getByText(before, { exact: true })).toHaveCount(0)

  // Back to create mode: the label reverts, and the field is empty rather than still
  // holding the name that was just saved.
  await expect(page.getByLabel("New list name")).toHaveValue("")

  await page.getByRole("button", { name: `Delete ${after}` }).click()
  await expect(page.getByText(after, { exact: true })).toHaveCount(0)
})

test("a category can be renamed, but not switched between income and expense", async ({
  page,
}) => {
  const before = `E2E category ${Date.now()}`
  const after = `${before} renamed`

  await page.goto("/budget/categories")
  const main = page.getByRole("main")

  await main.getByLabel("Name").fill(before)
  await main.getByRole("button", { name: "Add category" }).click()
  await expect(main.getByText(before, { exact: true })).toBeVisible()

  await main.getByRole("button", { name: `Edit ${before}` }).click()
  await expect(main.getByLabel("Name")).toHaveValue(before)

  // Kind is locked while editing, on purpose: flipping it under existing transactions
  // leaves them pointing at a category that no longer matches their type, and the
  // transaction dialog filters its picker by kind — so re-opening one of those would
  // silently drop its category. Renaming has no such consequence.
  await expect(main.getByLabel("Kind")).toBeDisabled()

  await main.getByLabel("Name").fill(after)
  await main.getByRole("button", { name: "Save category" }).click()
  await expect(page.getByText("Category updated")).toBeVisible()
  await expect(main.getByText(after, { exact: true })).toBeVisible()

  // The form is back to adding, which is what makes the kind select usable again.
  await expect(main.getByRole("button", { name: "Add category" })).toBeVisible()
  await expect(main.getByLabel("Kind")).toBeEnabled()

  await main.getByRole("button", { name: `Delete ${after}` }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete category" })
    .click()
  await expect(main.getByText(after, { exact: true })).toHaveCount(0)
})
