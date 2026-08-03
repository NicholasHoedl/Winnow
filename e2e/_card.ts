import { type Locator, type Page } from "@playwright/test"

/**
 * A **visible** `div.bg-card` containing `text` — the row/card locator this suite uses
 * everywhere.
 *
 * The visibility filter is load-bearing, not decoration. React's streaming SSR parks
 * completed Suspense content in a `<div hidden id="S:n">` and leaves that div in the DOM
 * afterwards, so a row can exist TWICE: once where it renders, once inside the staging
 * div. Playwright's strict mode counts matches **before** `toBeVisible()` gets to filter
 * them, so an unfiltered locator intermittently fails with "resolved to 2 elements" on a
 * page that is showing exactly one.
 *
 * Measured, not guessed: instrumenting `task-links.spec.ts` caught the pair three times
 * out of three — one `visible: true` under `main#content`, one `visible: false` inside
 * `DIV#S:1`, identical markup. It is timing-dependent, which is why the failing spec kept
 * moving around the suite rather than staying put.
 *
 * This is a stricter locator than the one it replaces, not a looser one: it still fails if
 * the row genuinely renders twice.
 */
export function visibleCard(page: Page, text: string | RegExp): Locator {
  return page
    .locator("div.bg-card")
    .filter({ hasText: text })
    .filter({ visible: true })
}
