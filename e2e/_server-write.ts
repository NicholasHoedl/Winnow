import type { Page, Response } from "./_test"

/**
 * Resolve once a Server Action write has actually reached the server.
 *
 * **Arm this BEFORE the interaction**, then await it before navigating:
 *
 * ```ts
 * const written = serverWrite(page)
 * // …drag, drop, press…
 * await expect.poll(…)   // the optimistic paint
 * await written          // the write landed
 * await page.reload()    // now the server has something to agree with
 * ```
 *
 * Three specs used to skip the middle line and it made all three flaky — the two in
 * `todos-reorder` and `calendar-reschedule`'s drag. The shape they shared:
 *
 * ```
 * await expect.poll(…)   // reads the OPTIMISTIC DOM, so it passes immediately
 * await page.reload()    // aborts the write that has not landed yet
 * expect(…)              // asserts the server agrees. Sometimes it does not.
 * ```
 *
 * `handleReorder` paints synchronously (`setPendingOrder(ids)`) and writes inside a
 * transition, so the poll is satisfied while `reorderTasks` is still in flight; the reload
 * then aborts the POST. **This was proved rather than guessed**: holding the Server Action
 * open for two seconds and reloading immediately loses the reorder every time, while 24
 * ordinary repeats of the spec never reproduced it. A rare race is not a rare bug.
 *
 * There is nothing in the DOM to wait on instead. `reorderTasks` returns `{ ok: true }` with
 * no toast, and clearing the pending order is visually a no-op once the server agrees — so
 * the app gives a passing write no signal at all, and the network is the only honest one.
 *
 * Matched on the `Next-Action` header rather than the method and URL: a Server Action POSTs
 * to the page's own route, so a method-and-path predicate would also match a form post or a
 * navigation and resolve on the wrong thing.
 */
export function serverWrite(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      "next-action" in response.request().headers(),
  )
}
