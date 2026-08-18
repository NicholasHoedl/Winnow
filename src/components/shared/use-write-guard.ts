"use client"

import * as React from "react"

/**
 * Warn before leaving while an optimistic write is still in flight.
 *
 * The hole this closes, and its exact size — both measured rather than assumed:
 *
 * Every drag-to-reorder and drag-to-reschedule surface paints the new order synchronously
 * and writes inside a transition. If the page goes away before that write lands, the write
 * is aborted and the change is lost with no error and nothing on screen — the same shape as
 * the disabled-submit trap in `docs/HANDOFF.md` §4: an action that appears to work and does
 * not.
 *
 * **Only a HARD navigation loses it.** A client-side route change keeps the JS context alive
 * and the fetch completes — proved by delaying a Server Action two seconds, soft-navigating
 * mid-flight, and finding the reorder persisted. A reload under the same conditions loses it
 * every single time. So the exposure is reload, tab close, or an off-site link, inside the few
 * hundred milliseconds a write is open.
 *
 * Which is why this is a `beforeunload` and not something larger. It is the one mechanism
 * that covers exactly that case, it costs nothing while idle, and in practice a person will
 * almost never see it: the listener is only registered while a write is genuinely open, so
 * the prompt appears when — and only when — leaving would have thrown work away.
 *
 * Deliberately NOT a router guard. Soft navigation does not lose anything, so intercepting it
 * would be friction bought for no safety.
 */
export function useWriteGuard(pending: boolean): void {
  React.useEffect(() => {
    if (!pending) return
    const warn = (event: BeforeUnloadEvent) => {
      // `preventDefault()` is the specified way to request the prompt. The text is the
      // browser's own and cannot be set — every engine ignores a custom string.
      event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [pending])
}
