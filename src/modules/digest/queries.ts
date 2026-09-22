// About this file: the server-side loader for the daily digest banner. The signed-in
// layout, `src/app/(app)/layout.tsx`, calls it and passes the result to the banner.
//
// What you'll find here:
// - `computeDigest`: returns null when the digest is turned off; otherwise loads today's
//   task counts, events and macro progress together and hands them to `buildDigest`.
//
// Related: `service.ts`, where `buildDigest` decides what the banner says.

import "server-only"

import { todayInZone } from "@/lib/date"
import { requireUserId } from "@/lib/session"
import { getDayEvents } from "@/modules/calendar/queries"
import { getMacroSummary } from "@/modules/meals/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getTaskSummary } from "@/modules/todos/queries"

import { buildDigest, type Digest } from "./service"

/** The current user's digest for today, or null when there's nothing worth saying.
 * Pure orchestration: each source query scopes itself to the session user, and the
 * guard below states that requirement locally rather than leaving it emergent.
 *
 * The `digestEnabled` check moved here from the banner in T45. The banner used to fetch
 * this itself and so could decide not to; it is now handed the result by the app shell's
 * server render, and the cheapest place to answer "the preference is off" is before the
 * three aggregations rather than after them. */
export async function computeDigest(): Promise<Digest | null> {
  await requireUserId()
  const { timeZone, digestEnabled } = await getUserPreferences()
  if (!digestEnabled) return null
  const today = todayInZone(new Date(), timeZone)

  const [tasks, events, macros] = await Promise.all([
    getTaskSummary(timeZone),
    getDayEvents(today, timeZone),
    getMacroSummary(today),
  ])

  return buildDigest(tasks, events, macros.progress)
}
