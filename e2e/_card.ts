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
  // Rail entries are excluded, and that exclusion is load-bearing since T10. Every card in
  // the rail carries `bg-card` like every other card, so a locator built from a shared title
  // — a spec cleaning up "E2E link " tasks while an "E2E link goal …" sits in the rail, or a
  // habit whose rule and whose task row have the same name — matched the rail entry too, and
  // then hung waiting for a "Task actions" button it does not have. Both of those actually
  // happened, in T10a and T10b.
  //
  // `[data-rail]` rather than a list of testids: a block added to the rail later is excluded
  // by construction instead of by remembering to come back here.
  return page
    .locator("div.bg-card:not([data-rail])")
    .filter({ hasText: text })
    .filter({ visible: true })
}

/**
 * One goal card on `/goals` (T13), by title.
 *
 * Not `visibleCard`: `cn`'s tailwind-merge drops `bg-card` the moment a variant sets a
 * different background, so a utility-class locator would silently stop matching. The rail
 * this replaced did exactly that when a goal was selected. Hence the explicit testid, which
 * survived the move for free. Same visibility filter, for the same streaming-SSR reason.
 */
export function goalCard(page: Page, text: string | RegExp): Locator {
  return page
    .getByTestId("goal-card")
    .filter({ hasText: text })
    .filter({ visible: true })
}

/**
 * Kept as an alias of `goalCard`, and deliberately not deleted.
 *
 * It existed because a goal had TWO presentations — the `lg:` rail card and the mobile chip
 * — so a helper running at an unknown viewport had to match either. T13 moved goals to
 * `/goals`, which renders one card at every width, and the chip is gone.
 *
 * The name stays because "which of the two goal elements is this" was a real question for
 * three tranches, and a spec that still asks it should get the right answer rather than a
 * missing import.
 */
export function goalEntry(page: Page, text: string | RegExp): Locator {
  return goalCard(page, text)
}
