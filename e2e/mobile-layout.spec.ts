import { test, expect, type Page } from "./_test"

/**
 * Every screen, at phone width, measured rather than eyeballed.
 *
 * This exists because the alternative kept being wrong. A static read of the CSS gets the
 * structure right and the arithmetic wrong — predicting a currency figure at 97px when the
 * real font renders it at 85px is the difference between a bug and a non-bug, and no amount
 * of care in the reading fixes that. Emulators are no better for the class of fault that
 * only appears once `env(safe-area-inset-bottom)` is non-zero.
 *
 * Two faults are detected, and they are genuinely different things:
 *
 *   BLOWOUT — the document scrolls sideways. Something is wider than the viewport and the
 *   whole page slides. Loud, obvious once you look, and impossible to miss on a device.
 *
 *   SPILL — an element's content is wider than the box it was given, but an ancestor's
 *   width is fixed, so the page does NOT scroll and the text simply lies on top of its
 *   neighbour. This is the quiet one. The budget month summary does exactly this: three
 *   `minmax(0,1fr)` columns of 93px holding figures that reach 96px, so a five-figure
 *   total overlaps the column beside it and nothing anywhere reports a problem.
 *
 * A spill check that only looked at the viewport would miss the second entirely, which is
 * why both are here.
 */

/** Every route under `(app)`. A new screen belongs in this list on the day it is added. */
const ROUTES = [
  "/",
  "/activity",
  "/activity/habits",
  "/activity/routines",
  "/budget",
  "/calendar",
  "/goals",
  "/meals",
  "/review",
  "/settings",
] as const

const PREFIX = "E2E mobile"

type Fault = {
  kind: "blowout" | "spill"
  tag: string
  className: string
  text: string
  /** Content width vs the width it was allotted. */
  contentWidth: number
  boxWidth: number
}

/**
 * Walks the rendered page and reports what does not fit.
 *
 * Runs in the browser, so it sees computed styles and real glyph metrics rather than a
 * guess at them.
 */
async function layoutFaults(page: Page): Promise<Fault[]> {
  return page.evaluate(() => {
    const faults: Fault[] = []
    const root = document.documentElement

    // A horizontal scroller is not a fault, it is a design. `habit-strip`, `goal-rail`,
    // `quick-pick-strip` and the calendar-feed URL all deliberately hold content wider
    // than themselves, and everything inside them inherits that intent — so the whole
    // subtree is excluded rather than just the scrolling element.
    const scrolls = (el: Element) => {
      const overflowX = getComputedStyle(el).overflowX
      return overflowX === "auto" || overflowX === "scroll"
    }
    const insideScroller = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement)
        if (scrolls(p)) return true
      return false
    }

    if (root.scrollWidth > root.clientWidth + 1) {
      faults.push({
        kind: "blowout",
        tag: "html",
        className: "",
        text: "",
        contentWidth: root.scrollWidth,
        boxWidth: root.clientWidth,
      })
    }

    const spilled: { el: HTMLElement; fault: Fault }[] = []
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!(el instanceof HTMLElement)) continue
      // `clientWidth` is 0 for inline elements and for anything not laid out; there is
      // nothing to compare against, and their block parent is what would report the spill.
      if (el.clientWidth === 0) continue
      if (el.scrollWidth <= el.clientWidth + 1) continue
      // `overflow-x: hidden` or `clip` is a deliberate crop — `truncate` compiles to it,
      // and truncated text is the intended behaviour, not a fault.
      if (getComputedStyle(el).overflowX !== "visible") continue
      if (insideScroller(el)) continue

      spilled.push({
        el,
        fault: {
          kind: "spill",
          tag: el.tagName.toLowerCase(),
          className: el.className.slice(0, 100),
          text: (el.textContent ?? "").trim().slice(0, 50),
          contentWidth: el.scrollWidth,
          boxWidth: el.clientWidth,
        },
      })
    }

    // An ancestor of a spill usually spills too, and reporting the whole chain buries the
    // cause under its parents. Keep only the deepest — the element actually too small for
    // what it holds — using real containment rather than guessing from widths or order.
    for (const { el, fault } of spilled) {
      if (spilled.some((other) => other.el !== el && el.contains(other.el)))
        continue
      faults.push(fault)
    }

    return faults
  })
}

function describe(faults: Fault[]): string {
  return faults
    .map(
      (f) =>
        `\n  [${f.kind}] <${f.tag} class="${f.className}">` +
        `\n    needs ${f.contentWidth}px, has ${f.boxWidth}px` +
        (f.text ? `\n    text: "${f.text}"` : ""),
    )
    .join("")
}

/**
 * Worst-case content, created on purpose.
 *
 * A sweep over whatever the account happens to hold measures the account, not the layout.
 * A five-figure amount is the value static analysis flagged as most likely to breach a box,
 * and an empty test account would never produce one on its own.
 *
 * Created through the UI rather than the database, so it is shaped exactly as the app
 * shapes it, and removed in `afterAll` — the suite shares one account.
 */
test.beforeAll(async ({ browser }) => {
  // `browser.newPage()` inherits NOTHING from the project's `use` — not the storage state
  // and not the base URL — so it would run signed out against a relative path. Reading
  // them off `test.info()` keeps this correct if either ever moves in the config.
  const { baseURL, storageState } = test.info().project.use
  const context = await browser.newContext({ baseURL, storageState })
  const page = await context.newPage()

  await page.goto("/budget")
  await page.getByRole("button", { name: "Add", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Amount", { exact: false }).fill("12345.67")
  await dialog.getByLabel("Payee").fill(`${PREFIX} large`)
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await dialog.waitFor({ state: "hidden" })

  await context.close()
})

test.afterAll(async ({ browser }) => {
  const { baseURL, storageState } = test.info().project.use
  const context = await browser.newContext({ baseURL, storageState })
  const page = await context.newPage()

  await page.goto("/budget")
  const row = page
    .locator("div.bg-card")
    .filter({ hasText: `${PREFIX} large` })
    .first()
  if (await row.isVisible()) {
    await row.getByRole("button", { name: "Transaction actions" }).click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(row).toHaveCount(0)
  }

  await context.close()
})

for (const route of ROUTES) {
  test(`${route} fits a phone`, async ({ page }) => {
    await page.goto(route)

    // The heading is the signal that the route rendered rather than 404ing or hanging on a
    // Suspense boundary — measuring an empty page would pass and mean nothing.
    await expect(page.locator("h1").first()).toBeVisible()

    const faults = await layoutFaults(page)
    expect(faults, `${route} at 393px:${describe(faults)}\n`).toEqual([])
  })
}
