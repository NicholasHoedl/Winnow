import { getGoalOptions } from "@/modules/goals/queries"
import { getArchivedHabits, getHabitsView } from "@/modules/habits/queries"

import { HabitsView } from "./_components/habits-view"

export default async function HabitsPage() {
  // Goals only for the dialog's optional link. `getGoalOptions` reads two columns, which
  // is why this takes it rather than the full `getGoals` the rail needs.
  const [view, goals, archived] = await Promise.all([
    getHabitsView(),
    getGoalOptions(),
    // Two columns and a timestamp for habits that are usually zero. Cheap enough to fetch
    // unconditionally, and fetching it behind a toggle would mean a round trip on a click
    // whose whole job is to reveal something.
    getArchivedHabits(),
  ])
  return <HabitsView {...view} goals={goals} archived={archived} />
}
