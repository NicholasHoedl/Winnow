import { getUserPreferences } from "@/modules/preferences/queries"
import { getLists, getTasks } from "@/modules/todos/queries"

import { TodosView } from "./_components/todos-view"

export default async function TodosPage() {
  const [{ timeZone }, tasks, lists] = await Promise.all([
    getUserPreferences(),
    getTasks(),
    getLists(),
  ])
  return <TodosView tasks={tasks} lists={lists} timeZone={timeZone} />
}
