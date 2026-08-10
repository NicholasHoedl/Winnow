import { getHabits } from "@/modules/todos/queries"

import { HabitsView } from "./_components/habits-view"

export default async function HabitsPage() {
  const { habits, from, to, weekStartsOn } = await getHabits()
  return (
    <HabitsView
      habits={habits}
      from={from}
      to={to}
      weekStartsOn={weekStartsOn}
    />
  )
}
