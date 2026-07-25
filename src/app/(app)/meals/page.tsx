import {
  getFoods,
  getMacroTargets,
  getMealEntries,
  getRecentEntries,
} from "@/modules/meals/queries"
import { recentFrequentFoods } from "@/modules/meals/service"
import { getUserPreferences } from "@/modules/preferences/queries"
import { todayInZone } from "@/lib/date"

import { MealsView } from "./_components/meals-view"

export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  const { timeZone } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today

  const [entries, foods, targets, recent] = await Promise.all([
    getMealEntries(date),
    getFoods(),
    getMacroTargets(),
    getRecentEntries(),
  ])
  const quickPicks = recentFrequentFoods(recent)

  return (
    <MealsView
      date={date}
      today={today}
      entries={entries}
      foods={foods}
      targets={targets}
      quickPicks={quickPicks}
    />
  )
}
