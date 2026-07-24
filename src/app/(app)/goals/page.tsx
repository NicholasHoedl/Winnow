import { getGoals } from "@/modules/goals/queries"

import { GoalsView } from "./_components/goals-view"

export default async function GoalsPage() {
  const goals = await getGoals()
  return <GoalsView goals={goals} />
}
