import { getLists } from "@/modules/todos/queries"

import { ListsView } from "./_components/lists-view"

export default async function ListsPage() {
  const lists = await getLists()
  return <ListsView lists={lists} />
}
