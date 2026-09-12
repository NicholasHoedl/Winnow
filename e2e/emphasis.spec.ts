import { test, expect, type Page } from "./_test"
import { visibleCard } from "./_card"

/**
 * Pass 5's rule, made measurable: **a daily screen draws exactly one control in the primary
 * fill, and it is that screen's main action.**
 *
 * Von Restorff — one thing stands out — only works while the distinctive treatment is
 * spent on one thing. Every extra filled button on a screen divides the emphasis by
 * another, and three of these screens were spending it two or three times over: a
 * quick-add bar's submit sat beside the header's action, the budget page's receipt reader
 * beside both, the meals page's weigh-in Save beside Log food.
 *
 * The fill is read from the `--primary` token as THIS browser resolves it rather than
 * hard-coded, so a change of palette re-aims the test instead of breaking it. Everything
 * else that could carry a background — outline, ghost, secondary, the tinted destructive —
 * resolves to a different colour, and a translucent `bg-primary/10` carries an alpha, so
 * comparing the serialised computed value is enough to tell the fill from its neighbours.
 */
const PHONE = { width: 393, height: 852 }

const ROUTINE_PREFIX = "E2E emphasis"

/**
 * The accessible names of every visible `button` or `a` painted in the primary fill.
 *
 * Names rather than a bare count, because the count alone cannot say whether the one
 * survivor is the right control. `aria-label` first, then the text — the exact order the
 * accessible name computation uses for the plain buttons and links this app draws.
 */
async function filledControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // A probe rather than `getPropertyValue("--primary")`: a custom property comes back as
    // its authored text, which never equals the resolved `background-color` a button
    // reports. Painting the token onto a real element makes the two comparable.
    const probe = document.createElement("span")
    probe.style.backgroundColor = "var(--primary)"
    probe.style.position = "fixed"
    document.body.append(probe)
    const fill = getComputedStyle(probe).backgroundColor
    probe.remove()

    const names: string[] = []
    for (const element of document.querySelectorAll("button, a")) {
      const style = getComputedStyle(element)
      if (style.backgroundColor !== fill) continue
      if (style.visibility === "hidden") continue
      const box = element.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      names.push(
        (
          element.getAttribute("aria-label") ??
          element.textContent ??
          ""
        ).trim(),
      )
    }
    return names
  })
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(PHONE)
})

test("the dashboard's one fill is New task", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible()
  expect(await filledControls(page)).toEqual(["New task"])
})

test("the dashboard's outline links draw a border in light mode", async ({
  page,
}) => {
  // Light specifically. `buttonVariants` without `cn` left BOTH `border-transparent` and
  // `border-border` on these links, and dark mode hid it: `dark:border-input` is more
  // specific than either, so only the light palette showed the borderless button.
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/")
  // next-themes writes the resolved theme onto <html>; if the account is pinned to dark
  // this check cannot mean anything, so say so rather than passing quietly.
  await expect(page.locator("html")).toHaveClass(/light/)

  const border = (name: string) =>
    page
      .getByRole("link", { name })
      .evaluate((element) => getComputedStyle(element).borderTopColor)

  // The quick-add bar's submit is a real `<Button variant="outline">`, so it is what an
  // outline control on this screen is supposed to look like.
  const button = await page
    .locator("form")
    .filter({ has: page.getByLabel("Quick add a task") })
    .getByRole("button", { name: "Add", exact: true })
    .evaluate((element) => getComputedStyle(element).borderTopColor)

  expect(button).not.toBe("rgba(0, 0, 0, 0)")
  expect(await border("Review")).toBe(button)
  expect(await border("Add event")).toBe(button)
})

test("every dashboard card heading is drawn the same", async ({ page }) => {
  await page.goto("/")

  const heading = (card: string) =>
    page.locator(`#card-${card}-heading`).evaluate((element) => {
      const style = getComputedStyle(element)
      return [style.fontSize, style.fontWeight, style.color].join(" ")
    })

  // The calendar card is left out on purpose: its heading is the month it is showing
  // rather than the card's name, and it is styled as the one it is.
  const slate = await heading("slate")
  for (const card of ["macros", "budget", "categories"]) {
    expect(await heading(card), card).toBe(slate)
  }
  // Practice renders only for an account that has habits, and the suite creates and
  // deletes those — so it is checked when it is there rather than required.
  if ((await page.locator("#card-goals-heading").count()) === 1) {
    expect(await heading("goals"), "goals").toBe(slate)
  }
})

test("the activity page's one fill is New task", async ({ page }) => {
  await page.goto("/activity")
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible()
  expect(await filledControls(page)).toEqual(["New task"])
})

test("the budget page's one fill is Add", async ({ page }) => {
  await page.goto("/budget")
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible()
  // The receipt reader lives in the AI panel below the ledger, which is only rendered
  // when the companion is configured — `ai.setup.ts` does that for the suite. Asserting it
  // is on screen keeps a silently-absent panel from making this test pass for free.
  await expect(
    page.getByRole("button", { name: "Read the receipt" }),
  ).toBeVisible()
  expect(await filledControls(page)).toEqual(["Add"])
})

test("the meals page's one fill is Log food", async ({ page }) => {
  await page.goto("/meals")
  await expect(page.getByRole("button", { name: "Log food" })).toBeVisible()
  // Same reason as the receipt reader above: the weigh-in card is behind a preference.
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeVisible()
  expect(await filledControls(page)).toEqual(["Log food"])
})

test.describe("the routines page", () => {
  test.afterEach(async ({ page }) => {
    await page.goto("/activity/routines")
    const cards = visibleCard(page, new RegExp(ROUTINE_PREFIX))
    for (let i = 0; i < 5; i++) {
      const count = await cards.count()
      if (count === 0) break
      await cards
        .first()
        .getByRole("button", { name: /^Actions for / })
        .click()
      await page.getByRole("menuitem", { name: "Delete" }).click()
      await page.getByRole("button", { name: "Delete", exact: true }).click()
      await expect(cards).toHaveCount(count - 1)
    }
    await expect(cards).toHaveCount(0)
  })

  test("its one fill is New routine", async ({ page }) => {
    const name = `${ROUTINE_PREFIX} ${Date.now()}`

    await page.goto("/activity/routines")
    await page.getByRole("button", { name: "New routine", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Name", { exact: true }).fill(name)
    await dialog.getByRole("button", { name: "Add", exact: true }).click()
    await expect(visibleCard(page, name)).toHaveCount(1)

    // Seeded rather than assumed: a card is what carries the Run button, and an empty
    // page would let this pass without ever measuring the thing the pass is about.
    expect(await filledControls(page)).toEqual(["New routine"])
  })
})
