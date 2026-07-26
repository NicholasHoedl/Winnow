import { revalidatePath } from "next/cache"

/**
 * The two cross-module pages: the dashboard and the /today hub. Both compose several
 * modules' read queries, so a mutation in ANY module changes what they render.
 *
 * Every module had grown its own `revalidateX()` covering its own route plus "/", and
 * each was written before /today existed (T2-S4), so none of the five ever gained it.
 *
 * Be clear about what this is worth today: **nothing observable.** Every route in this
 * app is dynamic (`auth()` reads cookies), `next.config.ts` sets no `staleTimes`, and
 * Next's client router cache uses staleTime 0 for dynamic routes — so a navigation
 * refetches regardless of what was revalidated. Measured, not assumed: dropping
 * /today here does not fail the hub freshness spec in e2e/today.spec.ts.
 *
 * It earns its keep the moment that stops being true — raising
 * `experimental.staleTimes.dynamic`, or making a hub static/ISR, would turn the
 * omission into a real stale-data bug. Naming the pair once means that's one edit
 * rather than five, and keeps the five modules consistent with each other.
 */
export function revalidateHubs(): void {
  revalidatePath("/")
  revalidatePath("/today")
}
