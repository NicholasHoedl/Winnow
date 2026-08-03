import { test, expect } from "@playwright/test"

import { visibleCard } from "./_card"

// Browser coverage for T5a-S5: skipping ONE cycle of a repeating task.
//
// The assertion that carries this spec is the RELOAD. `ensureRecurringTasks` re-materializes
// an instance on every render of /todos, the dashboard and the digest, so a skip
// that only removes the row looks correct right up until the next page load. Asserting the
// row is gone without reloading would pass against a plain delete — the very bug this
// feature exists to fix.

// Cleanup runs here, not only at the end of a test body: a failing assertion aborts the
// test, and a leaked RULE keeps generating a task every day forever. An earlier version
// cleaned up inline and leaked three rules before anyone noticed — the same lesson T4-S12
// learned about water logs, with a longer tail.
test.afterEach(async ({ page }) => {
  await page.goto("/todos")
  await page.getByRole("button", { name: "Repeating tasks" }).click()
  const dialog = page.getByRole("dialog")
  const strays = dialog.getByRole("button", { name: /^Stop repeating E2E / })
  // Bounded rather than `while`: a button that fails to remove its rule must end the loop
  // and let the assertion below report it, not spin.
  for (let i = 0; i < 10; i++) {
    const before = await strays.count()
    if (before === 0) break
    await strays.first().click()
    await page
      .getByRole("button", { name: "Stop repeating", exact: true })
      .click()
    // Auto-waits for the row to actually go, so a click that didn't take fails here
    // rather than silently looping.
    await expect(strays).toHaveCount(before - 1)
  }
  await expect(strays).toHaveCount(0)
})

test("skipping one cycle survives a reload, and can be undone", async ({
  page,
}) => {
  const title = `E2E skip ${Date.now()}`
  const row = () => visibleCard(page, title)

  // --- A daily repeating task. The generator materializes today's instance.
  await page.goto("/todos")
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(title)
  await dialog.getByRole("combobox").filter({ hasText: "Off" }).click()
  await page.getByRole("option", { name: "Daily" }).click()
  await dialog.getByRole("button", { name: "Create" }).click()
  await expect(row()).toHaveCount(1)

  // --- Skip, then undo while the toast is still up: the instance comes back.
  await row().getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Skip this one" }).click()
  await expect(row()).toHaveCount(0)

  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(row()).toHaveCount(1)
  await page.reload()
  // Back for real — undo removed the exception rather than just re-rendering.
  await expect(row()).toHaveCount(1)

  // --- Skip again, and this time reload. THIS is the point of the feature.
  await row().getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Skip this one" }).click()
  await expect(row()).toHaveCount(0)
  await page.reload()
  await expect(row()).toHaveCount(0)

  // …and it stays gone on the other surface that runs the same generator.
  await page.goto("/")
  await expect(page.getByText(title)).toHaveCount(0)

  // --- Cleanup through the Repeating tasks manager, which is the ONLY way to reach a rule
  // whose current cycle is skipped: both "Stop repeating" and the series editor hang off a
  // task row, and there is no row. An earlier version of this spec tried the row menu,
  // found nothing to click, and silently left the rule behind on every run.
  await page.goto("/todos")
  await stopRepeating(page, title)
})

/** Stop a rule from the Repeating tasks dialog. Works with no materialized instance. */
async function stopRepeating(
  page: import("@playwright/test").Page,
  title: string,
) {
  await page.getByRole("button", { name: "Repeating tasks" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText(title)).toBeVisible()
  await dialog.getByRole("button", { name: `Stop repeating ${title}` }).click()
  await page
    .getByRole("button", { name: "Stop repeating", exact: true })
    .click()
  await expect(dialog.getByText(title)).toHaveCount(0)
  await page.keyboard.press("Escape")
}

test("a one-off task is not offered a skip", async ({ page }) => {
  // Skipping only makes sense for a generated instance — for anything else the menu
  // would be offering a no-op, and the action would reject it server-side anyway.
  const title = `E2E noskip ${Date.now()}`
  const row = () => visibleCard(page, title)

  await page.goto("/todos")
  const input = page.getByLabel("Quick add task")
  await input.fill(title)
  await input.press("Enter")
  await expect(row()).toHaveCount(1)

  await row().getByRole("button", { name: "Task actions" }).click()
  await expect(
    page.getByRole("menuitem", { name: "Skip this one" }),
  ).toHaveCount(0)
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible()

  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row()).toHaveCount(0)
})
