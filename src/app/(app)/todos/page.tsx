import { getEventOptions } from "@/modules/calendar/queries"
import { getGoalOptions } from "@/modules/goals/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getLists, getTasks } from "@/modules/todos/queries"

import { TodosView } from "./_components/todos-view"

export default async function TodosPage() {
  const [{ timeZone }, tasks, lists, goals, events] = await Promise.all([
    getUserPreferences(),
    getTasks(),
    getLists(),
    getGoalOptions(),
    getEventOptions(),
  ])
  return (
    <TodosView
      tasks={tasks}
      lists={lists}
      goals={goals}
      events={events}
      timeZone={timeZone}
    />
  )
}
