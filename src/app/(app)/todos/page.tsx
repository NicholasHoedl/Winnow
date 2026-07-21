import { APP_TIME_ZONE } from "@/lib/config"
import { getLists, getTasks } from "@/modules/todos/queries"

import { TodosView } from "./_components/todos-view"

export default async function TodosPage() {
  const [tasks, lists] = await Promise.all([getTasks(), getLists()])
  return <TodosView tasks={tasks} lists={lists} timeZone={APP_TIME_ZONE} />
}
