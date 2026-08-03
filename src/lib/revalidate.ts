import { revalidatePath } from "next/cache"

/**
 * The cross-module page: the dashboard. It composes several modules' read queries, so a
 * mutation in ANY module changes what it renders.
 *
 * This named a PAIR until `/today` was folded into the dashboard — the two hubs ran five
 * of the same queries and differed only by the agenda, which now lives on `/`. One path
 * left, and the indirection kept anyway: the five module revalidators call this rather
 * than `revalidatePath("/")` directly, so "which pages are cross-module" stays one
 * statement rather than five, and a second hub would be one edit.
 *
 * Be clear about what this is worth today: **nothing observable.** Every route in this
 * app is dynamic (`auth()` reads cookies), `next.config.ts` sets no `staleTimes`, and
 * Next's client router cache uses staleTime 0 for dynamic routes — so a navigation
 * refetches regardless of what was revalidated. Measured, not assumed.
 *
 * It earns its keep the moment that stops being true — raising
 * `experimental.staleTimes.dynamic`, or making the dashboard static/ISR, would turn an
 * omission here into a real stale-data bug.
 */
export function revalidateHubs(): void {
  revalidatePath("/")
}
