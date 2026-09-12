import { expect, type Page } from "./_test"

/**
 * Assert that nothing was toasted.
 *
 * The obvious spelling — `expect(page.locator("[data-sonner-toaster]")).toBeEmpty()` —
 * cannot work: sonner renders NOTHING at all while its queue is empty, so the container
 * it names does not exist and the assertion fails for the wrong reason (or passes for
 * the wrong one, depending which way round it is written).
 *
 * So this waits a fixed moment and then asserts no `[data-sonner-toast]` exists. The wait
 * is the whole point — a toast that is about to appear takes a beat to appear, and an
 * immediate count of zero proves only that the assertion outran it. A second is well past
 * every toast in the suite, which are fired synchronously after their write returns.
 */
export async function noToast(page: Page): Promise<void> {
  await page.waitForTimeout(1000)
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0)
}
