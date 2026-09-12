import { test, expect } from "./_test"

import { visibleCard } from "./_card"
import { deleteTasksMatching } from "./_tasks"

/**
 * T42 (Pass 8): a write that cannot reach the server must not take the page with it.
 *
 * Every capture bar and every daily dialog wrote inside `startTransition(async () => {
 * await action() })`, which has no catch. A Server Action is a `fetch` underneath, and
 * with the network off that fetch REJECTS rather than returning a typed failure — so the
 * rejection escaped the transition and React replaced the whole route with its error
 * boundary ("Couldn't load your activity…"). The typed line went with it, and the route
 * did not come back when the network did.
 *
 * `context.setOffline` is the only way to arrange that honestly: `page.route(... abort)`
 * would not reproduce it for a Server Action, whose POST goes to the page's own URL.
 *
 * Both halves matter — the message, and what is still on screen to try again with.
 */

const PREFIX = "E2E offline"
const MESSAGE = "Couldn’t reach the app’s own server. Nothing was saved."

test.afterEach(async ({ context }) => {
  // Restored here too: a test that fails mid-body would otherwise leave the whole
  // browser context offline for everything that follows it.
  await context.setOffline(false)
  await deleteTasksMatching(PREFIX)
})

test("a capture bar with the network off says so and keeps the line", async ({
  page,
  context,
}) => {
  const title = `${PREFIX} bar ${Date.now()}`
  await page.goto("/activity")
  const bar = page.getByLabel("Quick add task")

  await context.setOffline(true)
  await bar.fill(title)
  await bar.press("Enter")

  await expect(page.getByText(MESSAGE)).toBeVisible()
  // The bar is still a bar — this is the assertion the error boundary used to fail.
  await expect(bar).toBeVisible()
  await expect(bar).toHaveValue(title)

  // And the network coming back costs one keystroke, not the whole line again.
  await context.setOffline(false)
  await bar.press("Enter")
  await expect(visibleCard(page, title)).toHaveCount(1)
})

test("a dialog with the network off stays open, holding what was typed", async ({
  page,
  context,
}) => {
  const title = `${PREFIX} dialog ${Date.now()}`
  await page.goto("/activity")
  await page.getByRole("button", { name: "New task" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(title)

  await context.setOffline(true)
  await dialog.getByRole("button", { name: "Create" }).click()

  await expect(page.getByText(MESSAGE)).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(title)

  await context.setOffline(false)
  await dialog.getByRole("button", { name: "Create" }).click()
  await expect(dialog).toBeHidden()
  await expect(visibleCard(page, title)).toHaveCount(1)
})
