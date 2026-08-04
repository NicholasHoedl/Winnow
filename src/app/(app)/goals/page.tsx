import { getGoals } from "@/modules/goals/queries"
import { getUserPreferences } from "@/modules/preferences/queries"

import { GoalsView } from "./_components/goals-view"

export default async function GoalsPage() {
  // The momentum window is measured in the user's own days, so the query needs both
  // before it can decide what counts as recent.
  const { timeZone, goalMomentumDays } = await getUserPreferences()
  const goals = await getGoals(timeZone, goalMomentumDays)
  return <GoalsView goals={goals} />
}
