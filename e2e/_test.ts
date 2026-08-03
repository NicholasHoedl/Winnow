import { test as base, expect } from "@playwright/test"

export { expect }
// Re-exported so a spec can take everything it needs from one place.
export type { Page, Locator } from "@playwright/test"

/**
 * The suite's `test`, with one thing added: a navigation never returns while React is
 * still relocating streamed content.
 *
 * React's Fizz streaming emits each completed Suspense boundary as
 * `<div hidden id="S:n">…</div>` followed by an inline `$RC(...)` script that moves the
 * children into place and removes the div. Between those two moments the DOM holds the
 * content TWICE — once staged, once rendered — and Playwright's strict mode counts both.
 *
 * That produced a whole class of "resolved to 2 elements" failures on pages showing
 * exactly one of everything, across every locator shape the suite uses: `div.bg-card`,
 * `getByText`, `getByTestId`, a class selector, a `section` filter. It is a race, so the
 * failing spec kept moving around the suite rather than staying put, which is what made
 * it read as flakiness. Direct calls (`locator.innerText()`) hit it hardest because a
 * strict-mode violation is thrown at once rather than retried.
 *
 * Waiting here rather than filtering at each call site: the filter approach is
 * whack-a-mole across ~70 locators and every future one, and it treats a timing problem
 * as a selector problem. Confirmed to reproduce against a production build, so this is
 * not a dev-server artifact.
 */
async function settle(page: import("@playwright/test").Page) {
  try {
    await page.waitForFunction(
      () => !document.querySelector('div[hidden][id^="S:"]'),
      null,
      { timeout: 5_000 },
    )
  } catch {
    // A boundary that never resolves is the page's problem, not the wait's — let the
    // assertion that follows report it in its own terms rather than failing here.
  }
}

export const test = base.extend({
  // The second argument is positional, so it is named `provide` rather than Playwright's
  // usual `use`: eslint's react-hooks/rules-of-hooks reads a bare `use(...)` call as a
  // React hook in a non-component function and errors. Renaming beats disabling the rule.
  page: async ({ page }, provide) => {
    // Both entry points into a fresh render: a navigation and a reload.
    const goto = page.goto.bind(page)
    page.goto = async (url, options) => {
      const response = await goto(url, options)
      await settle(page)
      return response
    }
    const reload = page.reload.bind(page)
    page.reload = async (options) => {
      const response = await reload(options)
      await settle(page)
      return response
    }
    await provide(page)
  },
})
