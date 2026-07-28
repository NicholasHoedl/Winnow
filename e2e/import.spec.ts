import { test, expect, type Page } from "@playwright/test"

// Browser coverage for T6a: restoring a backup.
//
// The round trip is the only test that proves this feature. "The button exists" proves
// nothing, and neither does "the import returned ok" — a restore that drops a table, or
// re-stamps every timestamp, or loses a foreign key, all report success. Export, import
// that same export, export again, and compare: anything the restore fails to put back
// exactly shows up as a difference.
//
// Importing that same export is also what makes this SAFE to run against the persistent
// dev database. The account is replaced with precisely what it already contained, so a
// passing run is a no-op and a failing one rolls back — the clear and the insert are one
// transaction. (A pg_dump was taken before this spec first ran, per the runbook.)

async function exportPayload(page: Page) {
  const response = await page.request.get("/settings/export")
  expect(response.status()).toBe(200)
  return (await response.json()) as Record<string, unknown>
}

/** Choose a file and type the confirmation, but stop short of confirming. */
async function stageImport(page: Page, payload: unknown, name = "winnow.json") {
  await page.goto("/settings")
  await expect(page.getByRole("button", { name: "Choose file" })).toBeVisible()
  await page.getByLabel("Backup file").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  })
}

test("a backup round-trips through export, import and export again", async ({
  page,
}) => {
  const before = await exportPayload(page)
  // A vacuous pass guard: an empty account would round-trip trivially and prove nothing.
  const rows = Object.values(before).filter(Array.isArray).flat().length
  expect(rows, "the dev account has no rows to round-trip").toBeGreaterThan(0)

  await stageImport(page, before)
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Type REPLACE").fill("REPLACE")
  await dialog.getByRole("button", { name: "Replace everything" }).click()
  await expect(dialog).toHaveCount(0)

  const after = await exportPayload(page)

  // Identical, not merely similar. Ids, createdAt and updatedAt included — those are the
  // three the undo path deliberately drops, and dropping them here would be a restore
  // that quietly rewrote every timestamp to the moment of the restore.
  expect(after).toEqual(before)
})

test("a file it can't read changes nothing", async ({ page }) => {
  // Validation happens before the first delete, so a rejected file must cost nothing.
  // Proven against a POPULATED account: an empty one would look the same either way.
  const before = await exportPayload(page)
  expect(
    Object.values(before).filter(Array.isArray).flat().length,
  ).toBeGreaterThan(0)

  const cases: { name: string; payload: unknown; expect: RegExp }[] = [
    {
      name: "a version from the future",
      payload: { ...before, version: 999 },
      expect: /version 999/i,
    },
    {
      name: "a missing table",
      payload: (() => {
        const copy = { ...before }
        delete copy.tasks
        return copy
      })(),
      expect: /missing "tasks"/i,
    },
    {
      name: "a link to a row that isn't in the file",
      payload: {
        ...before,
        tasks: [
          {
            id: "11111111-2222-3333-4444-555555555555",
            title: "Dangling",
            listId: "99999999-9999-9999-9999-999999999999",
          },
        ],
      },
      expect: /points at a lists record/i,
    },
    {
      // Passes validation and fails at the DATABASE: `parseImport` only requires an id,
      // so a row missing a NOT NULL column gets all the way to the insert. The
      // transaction still protects the data — but the failure has to arrive as a message
      // rather than as an unhandled rejection, or a corrupt file blanks the page.
      name: "a row the database refuses",
      payload: {
        ...before,
        tasks: [{ id: "33333333-4444-5555-6666-777777777777" }],
      },
      expect: /couldn't be restored/i,
    },
  ]

  for (const testCase of cases) {
    await stageImport(page, testCase.payload)
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await dialog.getByLabel("Type REPLACE").fill("REPLACE")
    await dialog.getByRole("button", { name: "Replace everything" }).click()

    // Scoped to the toast, not the page: the settings copy mentions "tasks" twice, and
    // an unscoped match would pass on the page's own prose rather than on the error.
    const toasts = page.getByRole("region", { name: /notification/i })
    await expect(
      toasts.getByText(testCase.expect),
      `${testCase.name} was not reported`,
    ).toBeVisible()
    await page.keyboard.press("Escape")

    // The account is untouched — which is the transaction's job, and the only part of
    // this that could go catastrophically wrong.
    expect(
      await exportPayload(page),
      `${testCase.name} changed the data`,
    ).toEqual(before)
  }
})

test("the confirmation has to be typed", async ({ page }) => {
  // The gate on the single most destructive action in the app.
  const before = await exportPayload(page)
  await stageImport(page, before)

  const dialog = page.getByRole("dialog")
  const confirm = dialog.getByRole("button", { name: "Replace everything" })
  await expect(confirm).toBeDisabled()

  await dialog.getByLabel("Type REPLACE").fill("replace")
  await expect(confirm, "lowercase should not arm it").toBeDisabled()

  await dialog.getByLabel("Type REPLACE").fill("REPLACE")
  await expect(confirm).toBeEnabled()

  // Re-opening must never arrive pre-armed.
  await page.keyboard.press("Escape")
  await stageImport(page, before)
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Replace everything" }),
  ).toBeDisabled()
})
