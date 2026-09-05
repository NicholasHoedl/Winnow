import { todayInZone } from "@/lib/date"
import { getEventOptions } from "@/modules/calendar/queries"
import { aiReady } from "@/modules/companion/ai-settings"
import { getPendingProposals } from "@/modules/companion/queries"
import { getGoalOptions, getGoals } from "@/modules/goals/queries"
import { weeklyCommitments } from "@/modules/companion/service"
import { getHabitStrip, getLiveHabits } from "@/modules/habits/queries"
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

  const [goals, habits, habitRows, goalOptions, events, aiSettings, pending] =
    await Promise.all([
      getGoals(timeZone, goalMomentumDays),
      // The practice that serves these goals. Until now `habits.goal_id` was visible in
      // exactly one place in the app — the dashboard's card — so this page could say a goal
      // was "Moving" and never name what was moving it. The cheap read, same as `/activity`
      // and `/`: four fields, and `adherence` for the current period only.
      getHabitStrip(),
      // The same habits as full rows, for the detail dialog's edit form. Two reads rather
      // than one widened shape: `HabitDialog` needs six columns the strip omits, and the
      // strip's leanness is what keeps it cheap on the dashboard and `/activity` too. This
      // one carries no entries at all.
      getLiveHabits(),
      // For the habit dialog's goal picker. `cache()`d, and already warm on this page.
      getGoalOptions(),
      // For the goal dialog's target-date link. Already fetched on every authenticated page
      // by the `(app)` layout for the global create dialogs, so this is a second call to a
      // `cache()`d query rather than a second round trip.
      getEventOptions(),
      getAiSettings(),
      // `goal_plan` only. Without the filter this page would auto-open whatever proposal was
      // newest — an import, a narrated week — because the view opens `pending[0]`.
      getPendingProposals("goal_plan"),
    ])

  // What the week already asks of you, for the plan panel's load warning. Measured from
  // the rows this page has already loaded rather than by a query of its own.
  const existingCommitments = weeklyCommitments(habitRows)

  return (
    <GoalsView
      goals={goals}
      habits={habits}
      habitRows={habitRows}
      goalOptions={goalOptions}
      events={events}
      pending={pending}
      // The page renders either way: goals are not an AI feature, and only the plan tool
      // is gated. `/companion` used to 404 outright when the companion was unconfigured,
      // which is exactly the coupling T13 removed by dispersing the tools.
      companionEnabled={aiReady(aiSettings)}
      today={todayInZone(new Date(), timeZone)}
      existingCommitments={existingCommitments}
    />
  )
}
