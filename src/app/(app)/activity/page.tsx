// About this file: the page component for /activity, the task list. It loads the tasks
// and what the task dialog needs on the server, then hands them to the client view.
//
// What you'll find here:
// - `ActivityPage`: reads the user's time zone and goal momentum window first.
// - The data load: tasks, lists, event options and goals, in parallel.
// - `goalOptions`: the task dialog's goal picker, built from the goals already loaded.
// - The render: `ActivityView`, with each task narrowed by `toActivityTask` and the
//   `?goal=` and `?list=` filters read from the URL.
//
// Related: `_components/activity-view.tsx`, which draws the list and its filters.

import { getEventOptions } from "@/modules/calendar/queries"
import { getGoals } from "@/modules/goals/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getLists, getTasks, toActivityTask } from "@/modules/todos/queries"

import { ActivityView } from "./_components/activity-view"

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ goal?: string; list?: string }>
}) {
  // Awaited before the rest: the momentum window is measured in the user's own days, so
  // `getGoals` cannot start until the time zone is known. Everything else runs in parallel
  // behind it.
  const { timeZone, goalMomentumDays } = await getUserPreferences()

  // Tasks, and what the task dialog needs — nothing else. `getTaskRecurrences` fed the
  // repeating-tasks dialog, and `getRoutines` and `getHabitStrip` fed the two rows that
  // stood above the list; all three are pages of their own now (ADR-0020 and its
  // amendment), and this page runs three queries fewer than it did.
  const [tasks, lists, events, goals, params] = await Promise.all([
    getTasks(),
    getLists(),
    getEventOptions(),
    getGoals(timeZone, goalMomentumDays),
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
      // Narrowed at the boundary, not passed whole: `getTasks` returns every column of the
      // row and the screen reads twelve of them. The six it does not were 99KB of this
      // page's 146KB document (T45) — see `toActivityTask`.
      tasks={tasks.map(toActivityTask)}
      lists={lists}
      goalOptions={goalOptions}
      events={events}
      goals={goals}
      // Read from the URL rather than held only in the client, so a search result can deep
      // link to one goal's work and a reload keeps you where you were.
      selectedGoalId={params.goal ?? null}
      selectedListId={params.list ?? null}
      timeZone={timeZone}
    />
  )
}
