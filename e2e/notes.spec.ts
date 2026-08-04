import { test, expect } from "./_test"
import { visibleCard } from "./_card"

// Every row this file creates carries this prefix so the sweep below can find it. The
// suite runs single-worker against the persistent dev database.
const PREFIX = "E2E note"

async function addNote(
  page: import("./_test").Page,
  fields: { title?: string; body: string },
) {
  await page.getByRole("button", { name: "New note", exact: true }).click()
  const dialog = page.getByRole("dialog")
  if (fields.title) {
    await dialog.getByLabel("Title", { exact: true }).fill(fields.title)
  }
  await dialog.getByLabel("Body", { exact: true }).fill(fields.body)
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(visibleCard(page, fields.title ?? fields.body)).toHaveCount(1)
}

/** Delete whatever this file left behind, one card at a time. */
test.afterEach(async ({ page }) => {
  await page.goto("/notes")
  const strays = visibleCard(page, new RegExp(PREFIX))
  for (let i = 0; i < 10; i++) {
    const count = await strays.count()
    if (count === 0) break
    // Matched by prefix rather than by reading the heading back: the label is derived
    // from the note's title, and a direct innerText() read is the call shape most
    // exposed to the streaming staging div (see _test.ts).
    await strays
      .first()
      .getByRole("button", { name: /^Actions for / })
      .click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(strays).toHaveCount(count - 1)
  }
  await expect(strays).toHaveCount(0)
})

test("creates, edits and persists a free-form note", async ({ page }) => {
  const title = `${PREFIX} groceries ${Date.now()}`
  await page.goto("/notes")
  await addNote(page, { title, body: "milk and bread" })

  await expect(visibleCard(page, title)).toContainText("milk and bread")

  // Edit it, then prove the change survives a round trip to the server.
  await visibleCard(page, title)
    .getByRole("button", { name: /^Actions for / })
    .click()
  await page.getByRole("menuitem", { name: "Edit" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Body", { exact: true }).fill("milk, bread and jam")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()

  await page.reload()
  await expect(visibleCard(page, title)).toContainText("milk, bread and jam")
})

test("writes today's journal entry and reopens it instead of duplicating", async ({
  page,
}) => {
  const body = `${PREFIX} journal ${Date.now()}`
  await page.goto("/notes")

  // The label doubles as the precondition: no entry exists for today yet.
  await page.getByRole("button", { name: "Write today", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Journal —")).toBeVisible()
  await dialog.getByLabel("Body", { exact: true }).fill(body)
  await dialog.getByRole("button", { name: "Add", exact: true }).click()

  await expect(visibleCard(page, body)).toHaveCount(1)

  // One entry per day: the header now offers to reopen the existing one, and doing so
  // seeds the editor with what was written rather than starting a second entry.
  const reopen = page.getByRole("button", {
    name: "Today's entry",
    exact: true,
  })
  await expect(reopen).toBeVisible()
  await reopen.click()
  await expect(dialog.getByLabel("Body", { exact: true })).toHaveValue(body)
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(visibleCard(page, body)).toHaveCount(1)
})

test("undo restores a deleted note", async ({ page }) => {
  const title = `${PREFIX} undo ${Date.now()}`
  await page.goto("/notes")
  await addNote(page, { title, body: "worth keeping" })

  await visibleCard(page, title)
    .getByRole("button", { name: /^Actions for / })
    .click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(visibleCard(page, title)).toHaveCount(0)

  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(visibleCard(page, title)).toHaveCount(1)
  // Restored from the row, not re-created — the body has to come back with it.
  await expect(visibleCard(page, title)).toContainText("worth keeping")
})

test("the dashboard prompts for today's entry, then shows it", async ({
  page,
}) => {
  const body = `${PREFIX} dashboard ${Date.now()}`

  await page.goto("/")
  await expect(
    page.getByRole("link", { name: /write today's entry/i }),
  ).toBeVisible()

  await page.goto("/notes")
  await page.getByRole("button", { name: "Write today", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Body", { exact: true }).fill(body)
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(visibleCard(page, body)).toHaveCount(1)

  await page.goto("/")
  await expect(page.getByText(body)).toBeVisible()
})
