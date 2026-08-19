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

/**
 * The same guarantee for a BURST: resolve once `count` Server Action writes have landed.
 *
 * `serverWrite` cannot be called in a loop for this — several writes are in flight at once,
 * so every `waitForResponse` would settle on whichever arrived first and the rest would be
 * counted twice. One listener, counting.
 *
 * This replaced a fixed `waitForTimeout(1_500)` in `quick-add-burst.spec.ts`, which was a
 * guess rather than a wait: `docs/HANDOFF.md` measures `/activity` at 1.7–3.4s per render on
 * this machine, so the sleep was routinely shorter than the thing it waited for, and the
 * `page.goto` that followed aborted whatever was still open. That is why only the DASHBOARD
 * test in that file was flaky — it is the only one that navigates after its burst.
 */
export function serverWrites(
  page: Page,
  count: number,
  timeoutMs = 30_000,
): Promise<void> {
  if (count <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let seen = 0
    const timer = setTimeout(() => {
      page.off("response", onResponse)
      reject(
        new Error(
          `Timed out after ${timeoutMs}ms waiting for ${count} Server Action writes; saw ${seen}.`,
        ),
      )
    }, timeoutMs)
    function onResponse(response: import("./_test").Response) {
      const request = response.request()
      if (request.method() !== "POST") return
      if (!("next-action" in request.headers())) return
      if (++seen < count) return
      clearTimeout(timer)
      page.off("response", onResponse)
      resolve()
    }
    page.on("response", onResponse)
  })
}
