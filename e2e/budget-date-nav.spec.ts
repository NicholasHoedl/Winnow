import { test, expect } from "./_test"

import { visibleCard } from "./_card"

// Browser coverage for T1-S7: budget NL quick-add + jump-to-date pickers (meals day / budget month).

test("budget quick-add logs a transaction", async ({ page }) => {
  const desc = `e2etx${Date.now()}`
  await page.goto("/budget")

  const bar = page.getByLabel("Quick add transaction")
  await bar.fill(`${desc} $4`)
  await bar.press("Enter")

  const row = visibleCard(page, desc)
  await expect(row).toBeVisible()

  // The suite runs serially against the persistent dev database, so a row left here
  // accumulates on every run — inflating the month's totals that other budget specs
  // read, and eventually pushing the transaction list past a screenful.
  await row.getByRole("button", { name: "Transaction actions" }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(row).toHaveCount(0)
})

test("budget quick-add rejects unparseable input and keeps the text", async ({
  page,
}) => {
  await page.goto("/budget")
  const bar = page.getByLabel("Quick add transaction")
  await bar.fill("nothing to parse here")
  await bar.press("Enter")

  await expect(page.getByText(/parse that/i)).toBeVisible()
  await expect(bar).toHaveValue("nothing to parse here")
})

test("meals day-picker jumps to a chosen day", async ({ page }) => {
  await page.goto("/meals")
  await page.getByRole("button", { name: "Jump to a day" }).click()

  const calendar = page.locator('[data-slot="calendar"]')
  await expect(calendar).toBeVisible()
  await calendar.getByText("15", { exact: true }).click()

  await expect(page).toHaveURL(/\/meals\?date=\d{4}-\d{2}-15$/)
})

test("budget month-picker jumps to a chosen month", async ({ page }) => {
  await page.goto("/budget")
  await page.getByRole("button", { name: "Jump to a month" }).click()

  const calendar = page.locator('[data-slot="calendar"]')
  await expect(calendar).toBeVisible()
  await calendar.getByText("15", { exact: true }).click()

  await expect(page).toHaveURL(/\/budget\?month=\d{4}-\d{2}$/)
})

/**
 * T36 (Tesler): the bar remembers how a line was filed.
 *
 * The quick-add bar writes its text as a DESCRIPTION and no payee, so until the memory
 * read fell back to that column the one surface built for repetition could teach it
 * nothing — "coffee 4 #food" every single day. Against a category it creates itself, and
 * both rows are deleted afterwards: the suite shares a database and these inflate the
 * month's totals.
 */
test("a tagged quick-add line files the same line next time", async ({
  page,
}) => {
  const stamp = Date.now()
  // One word, no spaces: a `#tag` stops at the first space.
  const category = `e2emem${stamp}`
  const text = `e2ememtx${stamp}`
  const row = (amount: string) =>
    visibleCard(page, text).filter({ hasText: amount })

  await page.goto("/budget/categories")
  await page.getByLabel("Name").fill(category)
  await page.getByRole("button", { name: "Add category" }).click()
  await expect(page.getByText("Category added")).toBeVisible()

  try {
    await page.goto("/budget")
    const bar = page.getByLabel("Quick add transaction")
    await bar.fill(`${text} 4 #${category}`)
    await bar.press("Enter")
    await expect(row("4.00")).toContainText(category)

    // The same line without the tag: the category comes back on its own.
    await bar.fill(`${text} 5`)
    await bar.press("Enter")
    await expect(row("5.00")).toContainText(category)
  } finally {
    for (const amount of ["4.00", "5.00"]) {
      const target = row(amount)
      if ((await target.count()) === 0) continue
      await target.getByRole("button", { name: "Transaction actions" }).click()
      await page.getByRole("menuitem", { name: "Delete" }).click()
      await expect(target).toHaveCount(0)
    }
    await page.goto("/budget/categories")
    await page.getByRole("button", { name: `Delete ${category}` }).click()
    await page.getByRole("button", { name: "Delete category" }).click()
    await expect(page.getByText(category, { exact: true })).toHaveCount(0)
  }
})

/**
 * T38 (Pass 4, uniform connectedness): the month control stays inside its own row.
 *
 * With "This month" on screen — which is every month but the current one — the five
 * controls were wider than the row holding them, and `justify-center` split the overflow
 * across both edges: "Previous month" hung 8px past the row's left and "This month" 9px
 * past its right, over whatever sat beside them. A control that leaves its own box stops
 * reading as one thing. The layout sweep only ever loaded the current month, which is why
 * it never saw this; `_layout.ts` walks a past month too now.
 *
 * A fixed month rather than a computed one: the assertion is about the widest state of the
 * control, and that state is "not this month", which any past month gives for good.
 */
test("the month control stays inside its row on a month that is not this one", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto("/budget?month=2026-01")
  await expect(page.getByRole("link", { name: "This month" })).toBeVisible()

  const children = await page
    .getByRole("link", { name: "Previous month" })
    .evaluate((link) => {
      const row = link.parentElement!
      const box = row.getBoundingClientRect()
      const main = document.getElementById("content")!.getBoundingClientRect()
      return Array.from(row.children).map((child) => {
        const rect = child.getBoundingClientRect()
        return {
          name: (
            child.textContent ||
            child.getAttribute("aria-label") ||
            ""
          ).trim(),
          pastRowLeft: Math.round(box.left - rect.left),
          pastRowRight: Math.round(rect.right - box.right),
          pastMainLeft: Math.round(main.left - rect.left),
          pastMainRight: Math.round(rect.right - main.right),
        }
      })
    })

  // The control is five things when "This month" shows. Guards against a vacuous pass if
  // the row ever stops being the links' parent.
  expect(children.length).toBe(5)
  for (const child of children) {
    expect(child.pastRowLeft, `${child.name} past the row's left`).toBeLessThan(
      2,
    )
    expect(
      child.pastRowRight,
      `${child.name} past the row's right`,
    ).toBeLessThan(2)
    expect(
      child.pastMainLeft,
      `${child.name} past the content's left`,
    ).toBeLessThan(2)
    expect(
      child.pastMainRight,
      `${child.name} past the content's right`,
    ).toBeLessThan(2)
  }
})
