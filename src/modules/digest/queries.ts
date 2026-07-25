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
 * guard below states that requirement locally rather than leaving it emergent. */
export async function computeDigest(): Promise<Digest | null> {
  await requireUserId()
  const { timeZone } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)

  const [tasks, events, macros] = await Promise.all([
    getTaskSummary(timeZone),
    getDayEvents(today, timeZone),
    getMacroSummary(today),
  ])

  return buildDigest(tasks, events, macros.progress)
}
