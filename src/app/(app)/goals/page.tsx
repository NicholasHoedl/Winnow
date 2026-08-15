import { todayInZone } from "@/lib/date"
import { aiReady } from "@/modules/companion/ai-settings"
import { getPendingProposals } from "@/modules/companion/queries"
import { getGoals } from "@/modules/goals/queries"
import {
  getAiSettings,
  getUserPreferences,
} from "@/modules/preferences/queries"

import { GoalsView } from "./_components/goals-view"

/**
 * Goals, with a page again.
 *
 * `/goals` was a permanent redirect to `/activity` from T10 until T13 — ADR-0013 merged
 * them because a goal is a predicate over tasks and two pages were describing the same rows
 * from opposite ends. That insight survives and this does not reverse it: there is
 * deliberately **no task list here**, and each card links to `/activity?goal=<id>` instead
 * of carrying the read-only copy T10a deleted.
 *
 * What changed is where the goals themselves live. They were a rail, which was `lg:flex` —
 * so on a phone they were a horizontal chip scroller, and the width they cost `/activity`
 * is what T12d then compressed habits and routines to pay for. A page serves them at every
 * width and gives the plan tool somewhere to land.
 */
export default async function GoalsPage() {
  // Awaited first: the momentum window is measured in the user's own days, so `getGoals`
  // cannot start until the time zone is known.
  const { timeZone, goalMomentumDays } = await getUserPreferences()

  const [goals, aiSettings, pending] = await Promise.all([
    getGoals(timeZone, goalMomentumDays),
    getAiSettings(),
    // `goal_plan` only. Without the filter this page would auto-open whatever proposal was
    // newest — an import, a narrated week — because the view opens `pending[0]`.
    getPendingProposals("goal_plan"),
  ])

  return (
    <GoalsView
      goals={goals}
      pending={pending}
      // The page renders either way: goals are not an AI feature, and only the plan tool
      // is gated. `/companion` used to 404 outright when the companion was unconfigured,
      // which is exactly the coupling T13 removed by dispersing the tools.
      companionEnabled={aiReady(aiSettings)}
      today={todayInZone(new Date(), timeZone)}
    />
  )
}
