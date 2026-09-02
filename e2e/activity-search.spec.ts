import { test, expect } from "./_test"

import { visibleCard } from "./_card"
import { serverWrite } from "./_server-write"
import { deleteTasksMatching } from "./_tasks"

// Browser coverage for /activity's status filter and its search box.
//
// The filter was Active/All and opened on Active. It is Active/All/Completed and opens on
// All, and those two changes are ONE decision rather than two: the box narrows what the
// filter has already chosen instead of reaching past it, so an Active default would have
// silently hidden every match the user had already finished. A search that omits the thing
// you searched for is worse than no search, and defaulting to All is what makes the
// narrower rule safe. Both halves are asserted below, because either one alone is wrong.

const PREFIX = "E2E findme"

// The suite empties the database per RUN, not per test, so debris still reaches the specs
// that follow this one within a run — and this file leaves completed tasks behind, which
// `/activity` now shows by default.
test.afterEach(async () => {
  await deleteTasksMatching(PREFIX)
})

async function quickAdd(page: import("@playwright/test").Page, title: string) {
  await page.goto("/activity")
  const input = page.getByLabel("Quick add task")
  await input.fill(title)
  await input.press("Enter")
  await expect(visibleCard(page, title)).toBeVisible()
}

/** Tick a task off and wait for the write, rather than for a repaint. */
async function complete(page: import("@playwright/test").Page, title: string) {
  const written = serverWrite(page)
  await visibleCard(page, title).getByLabel("Mark as done").click()
  await written
}

test("Completed shows finished work, and Active shows open work", async ({
  page,
}) => {
  const stamp = Date.now()
  const openTitle = `${PREFIX} open ${stamp}`
  const doneTitle = `${PREFIX} done ${stamp}`
  await quickAdd(page, openTitle)
  await quickAdd(page, doneTitle)
  await complete(page, doneTitle)

  await page.getByRole("button", { name: "Completed", exact: true }).click()
  await expect(visibleCard(page, doneTitle)).toBeVisible()
  await expect(visibleCard(page, openTitle)).toHaveCount(0)

  await page.getByRole("button", { name: "Active", exact: true }).click()
  await expect(visibleCard(page, openTitle)).toBeVisible()
  await expect(visibleCard(page, doneTitle)).toHaveCount(0)
})

test("All is the default, so a completed task survives a reload on screen", async ({
  page,
}) => {
  const title = `${PREFIX} default ${Date.now()}`
  await quickAdd(page, title)
  await complete(page, title)

  // There is deliberately no filter click anywhere in this test. The reload is what makes
  // it an assertion about the DEFAULT rather than about optimistic state.
  await page.reload()
  await expect(visibleCard(page, title)).toBeVisible()
})

test("the search box narrows the list, and says so when nothing matches", async ({
  page,
}) => {
  const stamp = Date.now()
  const wanted = `${PREFIX} artichoke ${stamp}`
  const other = `${PREFIX} bicycle ${stamp}`
  await quickAdd(page, wanted)
  await quickAdd(page, other)

  const search = page.getByLabel("Search tasks")
  await search.fill("artichoke")
  await expect(visibleCard(page, wanted)).toBeVisible()
  await expect(visibleCard(page, other)).toHaveCount(0)

  // Its own empty message. The standard one explains where a captured task lands, which is
  // not what you want to read when you typed a word and got nothing back.
  await search.fill("zzzznotathing")
  await expect(page.getByText("No tasks match that search.")).toBeVisible()

  // Clearing it is a filter being switched off, not a search for the empty string.
  await search.fill("")
  await expect(visibleCard(page, wanted)).toBeVisible()
  await expect(visibleCard(page, other)).toBeVisible()
})

test("search stays inside the current filter", async ({ page }) => {
  const title = `${PREFIX} kumquat ${Date.now()}`
  await quickAdd(page, title)
  await complete(page, title)

  await page.reload()
  const search = page.getByLabel("Search tasks")
  await search.fill("kumquat")
  // Found under All, which is the default...
  await expect(visibleCard(page, title)).toBeVisible()

  // ...and NOT under Active, because the filter chooses before the box narrows. This is the
  // deliberate trade, and the reason the default had to move.
  await page.getByRole("button", { name: "Active", exact: true }).click()
  await expect(visibleCard(page, title)).toHaveCount(0)
})
