import { test, expect, type Page } from "./_test"

import { visibleCard } from "./_card"
import { deleteListsMatching, seedList } from "./_lists"
import { deleteTasksMatching } from "./_tasks"

/**
 * Browser coverage for T26: lists are a VIEW, not only a picker.
 *
 * SPEC §7.1 promised "views: by list" in the first tranche and the app shipped the picker
 * without the view — a task could be filed under a list and never seen by it. Three things
 * close that here: the Lists page counts each list and links to the Tasks page filtered to
 * it, `#list` in either quick-add files a task as it is captured, and a default list files
 * the ones typed without a tag. The filter itself is covered beside the goal filter in
 * `activity.spec.ts`.
 *
 * `tasks.list_id` is `ON DELETE SET NULL`, so cleanup deletes the tasks first and the lists
 * last — a list deleted first would only unfile its tasks and leave them behind.
 */

const STAMP = Date.now()
const LIST = `E2E lists home ${STAMP}`
// `tagKey(LIST)`: case-folded, spaces as hyphens — the one word quick-add reaches it by.
const TAG = `#e2e-lists-home-${STAMP}`
const PREFIX = "E2E lists task"

function defaultsForm(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save defaults" }) })
}

async function setDefaultList(page: Page, option: string) {
  await page.goto("/settings/defaults")
  await defaultsForm(page).getByLabel("Default list").click()
  await page.getByRole("option", { name: option }).click()
  await defaultsForm(page)
    .getByRole("button", { name: "Save defaults" })
    .click()
  await expect(page.getByText("Defaults saved")).toBeVisible()
}

test.afterEach(async () => {
  await deleteTasksMatching(PREFIX)
  await deleteListsMatching("E2E lists ")
})

test("#list files a captured task, and the Lists page counts and links to it", async ({
  page,
}) => {
  const listId = await seedList({ name: LIST })
  const title = `${PREFIX} tagged ${STAMP}`

  await page.goto("/activity")
  const input = page.getByLabel("Quick add task")
  await input.fill(`${title} ${TAG}`)
  await input.press("Enter")

  // The tag comes OUT of the title and shows as the row's list badge instead.
  const row = visibleCard(page, title)
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(LIST)
  await expect(page.getByText(TAG)).toHaveCount(0)

  // The Lists page counts it, and the name is the way to the filtered view.
  await page.goto("/activity/lists")
  const entry = page.locator("li").filter({ hasText: LIST })
  await expect(entry).toContainText("1 open")
  await entry.getByRole("link", { name: LIST }).click()
  await expect(page).toHaveURL(new RegExp(`/activity\\?list=${listId}$`))
  await expect(visibleCard(page, title)).toHaveCount(1)
})

test("the dashboard's capture takes a #list beside the date", async ({
  page,
}) => {
  await seedList({ name: LIST })
  const title = `${PREFIX} dashboard ${STAMP}`

  await page.goto("/")
  const input = page.getByLabel("Quick add a task")
  await input.fill(`${title} tomorrow ${TAG}`)
  await input.press("Enter")
  // Both parsers ran: the date left the title, and so did the tag.
  await expect(page.getByText(`Added “${title}”`)).toBeVisible()

  await page.goto("/activity")
  await expect(visibleCard(page, title)).toContainText(LIST)
})

test("a default list files what quick-add captures without a tag", async ({
  page,
}) => {
  await seedList({ name: LIST })
  const title = `${PREFIX} default ${STAMP}`

  await setDefaultList(page, LIST)
  try {
    await page.goto("/activity")
    const input = page.getByLabel("Quick add task")
    await input.fill(title)
    await input.press("Enter")
    await expect(visibleCard(page, title)).toContainText(LIST)
  } finally {
    // Back to No list whatever happened above: a default left set would file every later
    // quick-add in the suite somewhere its spec did not ask for.
    await setDefaultList(page, "No list")
  }
})
