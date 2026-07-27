import { getEventOptions } from "@/modules/calendar/queries"
import { getGoalOptions } from "@/modules/goals/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getLists, getTaskRecurrences, getTasks } from "@/modules/todos/queries"

import { TodosView } from "./_components/todos-view"

export default async function TodosPage() {
  const [{ timeZone }, tasks, lists, rules, goals, events] = await Promise.all([
    getUserPreferences(),
    getTasks(),
    getLists(),
    getTaskRecurrences(),
    getGoalOptions(),
    getEventOptions(),
  ])
  return (
    <TodosView
      tasks={tasks}
      lists={lists}
      rules={rules}
      goals={goals}
      events={events}
      timeZone={timeZone}
    />
  )
}
