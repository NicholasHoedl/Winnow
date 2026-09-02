import { test, expect } from "./_test"

import { visibleCard } from "./_card"
import { serverWrite } from "./_server-write"

// Full write-path through a real browser: quick-add → complete → delete (cleanup).
test("add, complete, and delete a to-do", async ({ page }) => {
  const title = `E2E todo ${Date.now()}`
  await page.goto("/activity")

  const input = page.getByLabel("Quick add task")
  // Armed before the Enter, awaited after. This was the one spec in the quick-add family
  // with no cushion at all: a bare 10s `toBeVisible()` had to cover the Server Action round
  // trip AND the render, and `playwright.config.ts` documents /activity at 1.7–3.4s per
  // render in dev with more than 2x jitter between identical consecutive requests. Matched
  // on the title so an unrelated action cannot satisfy it — see `_server-write.ts`.
  const written = serverWrite(page, (body) => body.includes(title))
  await input.fill(title)
  await input.press("Enter")
  await written

  // All is the DEFAULT now, so this click is belt and braces rather than a switch. Kept
  // because it says which view the line-through below is being asserted in, and because
  // Active would hide the row outright.
  await page.getByRole("button", { name: "All", exact: true }).click()

  const row = visibleCard(page, title)
  await expect(row).toBeVisible()

  // Complete it — the title picks up a line-through.
  await row.getByLabel("Mark as done").click()
  await expect(row.getByText(title, { exact: true })).toHaveClass(
    /line-through/,
  )

  // Delete it (cleanup) via the row menu.
  await row.getByRole("button", { name: "Task actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(visibleCard(page, title)).toHaveCount(0)
})
