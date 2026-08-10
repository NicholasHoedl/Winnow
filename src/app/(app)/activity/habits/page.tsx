import { getGoalOptions } from "@/modules/goals/queries"
import { getHabitsView } from "@/modules/habits/queries"

import { HabitsView } from "./_components/habits-view"

export default async function HabitsPage() {
  // Goals only for the dialog's optional link. `getGoalOptions` reads two columns, which
  // is why this takes it rather than the full `getGoals` the rail needs.
  const [view, goals] = await Promise.all([getHabitsView(), getGoalOptions()])
  return <HabitsView {...view} goals={goals} />
}
