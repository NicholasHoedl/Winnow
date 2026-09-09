import { getListTaskCounts, getLists } from "@/modules/todos/queries"

import { ListsView } from "./_components/lists-view"

export default async function ListsPage() {
  const [lists, counts] = await Promise.all([getLists(), getListTaskCounts()])
  return <ListsView lists={lists} counts={counts} />
}
