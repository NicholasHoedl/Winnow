import { getTaskRecurrences } from "@/modules/todos/queries"

import { RepeatingView } from "./_components/repeating-view"

export default async function RepeatingPage() {
  const rules = await getTaskRecurrences()
  return <RepeatingView rules={rules} />
}
