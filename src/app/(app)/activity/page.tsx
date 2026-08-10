import { todayInZone } from "@/lib/date"
import { getEventOptions } from "@/modules/calendar/queries"
import { getGoals } from "@/modules/goals/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getRoutines } from "@/modules/routines/queries"
import {
  getHabits,
  getLists,
  getTaskRecurrences,
  getTasks,
} from "@/modules/todos/queries"

import { ActivityView } from "./_components/activity-view"

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ goal?: string }>
}) {
  // Awaited before the rest: the momentum window is measured in the user's own days, so
  // `getGoals` cannot start until the time zone is known. Everything else runs in parallel
  // behind it.
  const { timeZone, goalMomentumDays } = await getUserPreferences()

  const [tasks, lists, rules, events, goals, routines, habits, params] =
    await Promise.all([
      getTasks(),
      getLists(),
      getTaskRecurrences(),
      getEventOptions(),
      getGoals(timeZone, goalMomentumDays),
      getRoutines(),
      // Default window, deliberately — the same one `/activity/habits` uses. A shorter one
      // would make the rail cheaper and make its streak number DISAGREE with the page it
      // links to, which is a worse bug than a slower query on a single-user app.
      getHabits(),
      searchParams,
    ])

  // The task dialog's goal picker used to come from `getGoalOptions()`, a second query
  // against the same table. `getGoals` already returns every goal the user has — it bounds
  // each goal's LINKED TASKS, not the goal list — so the picker is derived from it here and
  // the page runs one query fewer. `getGoalOptions` still exists for the app layout, which
  // needs the picker without any of the progress arithmetic.
  const goalOptions = goals.map((goal) => ({ id: goal.id, title: goal.title }))

  return (
    <ActivityView
      tasks={tasks}
      lists={lists}
      rules={rules}
      goalOptions={goalOptions}
      events={events}
      goals={goals}
      routines={routines}
      habits={habits.habits}
      // Resolved server-side so the run dialog's default anchor matches what the rest of
      // the app calls "today", rather than whatever the device clock says.
      today={todayInZone(new Date(), timeZone)}
      // Read from the URL rather than held only in the client, so a search result can deep
      // link to one goal's work and a reload keeps you where you were.
      selectedGoalId={params.goal ?? null}
      timeZone={timeZone}
    />
  )
}
