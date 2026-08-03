"use client"

import * as React from "react"

/**
 * False on the server and through the first client render, true afterwards.
 *
 * For RENDERING something that only exists on the client: a value read from localStorage
 * shows its server fallback until hydration finishes, and drawing that fallback is a
 * flash of the wrong thing. `ModeToggle` uses it to hold its icon until it knows.
 *
 * Not for deciding whether to WRITE. This forces a re-render once hydration lands, so a
 * component high in a layout re-renders everything under it — `AppearanceSync` sits above
 * `{children}` in the (app) layout and re-triggered the Suspense boundary around every
 * page, leaving two copies of the page body mounted in dev. An effect that reads
 * localStorage directly is already correct and re-renders nothing; prefer that.
 *
 * `useSyncExternalStore` rather than a setState-in-effect: React's own answer for
 * server/client snapshot differences, and the one the react-compiler lint accepts
 * (`react-hooks/set-state-in-effect`). The first client render still matches the server,
 * so hydration stays clean; nothing ever changes, hence the no-op subscribe.
 */
const NEVER_CHANGES = () => () => {}

export function useHydrated(): boolean {
  return React.useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  )
}
