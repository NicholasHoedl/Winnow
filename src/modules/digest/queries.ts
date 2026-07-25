import "server-only"

import { todayInZone } from "@/lib/date"
import { getDayEvents } from "@/modules/calendar/queries"
import { getMacroSummary } from "@/modules/meals/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getTaskSummary } from "@/modules/todos/queries"

import { buildDigest, type Digest } from "./service"

/** The current user's digest for today, or null when there's nothing worth saying.
 * Pure orchestration — each source query enforces its own user scoping. */
export async function computeDigest(): Promise<Digest | null> {
  const { timeZone } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)

  const [tasks, events, macros] = await Promise.all([
    getTaskSummary(timeZone),
    getDayEvents(today, timeZone),
    getMacroSummary(today),
  ])

  return buildDigest(tasks, events, macros.progress)
}
