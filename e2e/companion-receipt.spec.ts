import { test, expect, type Page } from "./_test"

import { visibleCard } from "./_card"
import { deleteTransactionsMatching } from "./_transactions"

// Browser coverage for T33 (ADR-0028): a photo of a receipt becomes one proposed
// transaction per category of item, the rows can be edited before Apply, and a discard
// creates nothing.
//
// The provider is `e2e/_ai-stub.mjs`, whose `receiptFor` answers a fixed reading — five
// lines in two categories against a total five over the lines. The fixture is a 64×96
// striped PNG; the browser's resize and re-encode, the request with its image part, the
// row derivation, the review's editing and the writes through `createTransaction` are
// what is under test. Whether a real model reads a real receipt well is unassertable, as
// ADR-0011 accepts for every companion job.

const FIXTURE = "e2e/fixtures/receipt.png"

/** Empty `/budget`'s pending queue — see `companion.spec.ts` for why every test starts so. */
async function clearQueue(page: Page) {
  for (let i = 0; i < 20; i++) {
    await page.goto("/budget")
    const dismiss = page.getByRole("button", { name: /^(Discard|Done)$/ })
    if ((await dismiss.count()) === 0) return
    await dismiss.first().click()
    await expect(dismiss).toHaveCount(0)
  }
  throw new Error("The pending queue on /budget would not empty.")
}

/** The one category the stub names that the user can have. Same helper as companion.spec. */
async function ensureFoodCategory(page: Page): Promise<boolean> {
  await page.goto("/budget/categories")
  const main = page.getByRole("main")
  await expect(main.getByRole("button", { name: "Add category" })).toBeVisible()
  if ((await main.getByText("Food", { exact: true }).count()) > 0) return false
  await main.getByLabel("Name").fill("Food")
  await main.getByRole("button", { name: "Add category" }).click()
  await expect(main.getByText("Food", { exact: true })).toBeVisible()
  return true
}

async function removeFoodCategory(page: Page) {
  await page.goto("/budget/categories")
  await page.getByRole("button", { name: "Delete Food" }).click()
  await page.getByRole("button", { name: "Delete category" }).click()
  await expect(
    page.getByRole("main").getByText("Food", { exact: true }),
  ).toHaveCount(0)
}

async function scan(page: Page) {
  await page.goto("/budget")
  await page.getByLabel("Receipt photo").setInputFiles(FIXTURE)
  // The preview is the proof the browser decoded and shrank the file before sending it.
  await expect(
    page.getByRole("img", { name: "The receipt you chose" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Read the receipt" }).click()
  await expect(page.getByText("Transactions found")).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await clearQueue(page)
})

test.afterEach(async () => {
  // The suite shares a persistent database and these inflate month totals.
  await deleteTransactionsMatching("STUB WALMART")
})

test("a photo becomes one row per category, and an edit survives to the ledger", async ({
  page,
}) => {
  const seededFood = await ensureFoodCategory(page)
  await scan(page)

  // Two categories on the receipt, so two rows — the groceries and the rest — and the
  // reading shown above them for checking against the paper.
  await expect(page.getByText("2 rows read from your receipt")).toBeVisible()
  await expect(page.getByText("What it read")).toBeVisible()
  await expect(page.getByText(/5 lines/)).toBeVisible()
  // Tax spread in proportion: 10 and 45 of lines against 60 paid.
  await expect(page.getByText(/10\.91/)).toBeVisible()
  await expect(page.getByText(/49\.09/)).toBeVisible()
  // "Food" matched the user's category; "No Such Category" did not.
  await expect(page.getByText(/Creates 2 transactions/)).toBeVisible()
  await expect(page.getByText(/1 uncategorised/)).toBeVisible()

  // The second row, edited: a corrected amount and a category chosen by hand. Scoped to
  // the row's editor — the ledger's filter bar has a "Category" control too.
  await page.getByRole("button", { name: "Edit STUB WALMART" }).nth(1).click()
  const editor = page.getByRole("group", { name: "Edit STUB WALMART" })
  await editor.getByLabel("Amount").fill("50")
  await editor.getByLabel("Category").click()
  await page.getByRole("option", { name: "Food" }).click()
  // The footer's count is derived from the rows through `resolveCategory`, so it going
  // quiet is the proof the chosen name took. (The picker's own "Uncategorised" option
  // stays in the DOM after it closes, so a page-wide text count would still find one.)
  await expect(page.getByText(/Creates 2 transactions/)).not.toContainText(
    "uncategorised",
  )
  await page
    .getByRole("button", { name: "Finish editing STUB WALMART" })
    .click()

  await page.getByRole("button", { name: "Apply" }).click()

  // Still on the budget page, and both rows are real transactions with the edit kept.
  await expect(page).toHaveURL(/\/budget/)
  await expect(visibleCard(page, "STUB WALMART")).toHaveCount(2)
  await expect(
    visibleCard(page, "STUB WALMART").filter({ hasText: /50\.00/ }),
  ).toHaveCount(1)
  await expect(
    visibleCard(page, "STUB WALMART").filter({ hasText: /10\.91/ }),
  ).toHaveCount(1)

  if (seededFood) await removeFoodCategory(page)
})

test("a scan is revised as a scan, and a discarded one creates nothing", async ({
  page,
}) => {
  await scan(page)

  // The refinement box sits on the scan panel and sends the photo again: the stub
  // answers a revision request with a one-line reading, which replaces the proposal.
  await page.getByLabel("Change this extraction").fill("the game is Food")
  await page.getByRole("button", { name: "Revise the proposal" }).click()
  await expect(page.getByText("1 row read from your receipt")).toBeVisible()
  await expect(page.getByText("Refined line")).toBeVisible()

  await page.getByRole("button", { name: "Discard", exact: true }).click()
  await expect(
    page.getByRole("button", { name: /^(Discard|Done)$/ }),
  ).toHaveCount(0)
  await expect(visibleCard(page, "STUB WALMART")).toHaveCount(0)
})
