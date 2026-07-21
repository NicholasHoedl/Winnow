import { APP_TIME_ZONE } from "@/lib/config"
import {
  getFoods,
  getMacroTargets,
  getMealEntries,
} from "@/modules/meals/queries"
import { todayInZone } from "@/modules/todos/service"

import { MealsView } from "./_components/meals-view"

export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  const today = todayInZone(new Date(), APP_TIME_ZONE)
  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today

  const [entries, foods, targets] = await Promise.all([
    getMealEntries(date),
    getFoods(),
    getMacroTargets(),
  ])

  return (
    <MealsView
      date={date}
      today={today}
      entries={entries}
      foods={foods}
      targets={targets}
    />
  )
}
