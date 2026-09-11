import {
  getBodyWeight,
  getFoods,
  getMacroTargetHistory,
  getMacroTargets,
  getMealEntries,
  getRecentEntries,
  getSavedMeals,
  getWaterLogs,
  getWeightTrend,
} from "@/modules/meals/queries"
import {
  recentFrequentFoods,
  resolveSavedMealItems,
  weightReadout,
  weightTrend,
} from "@/modules/meals/service"
import { getUserPreferences } from "@/modules/preferences/queries"
import { dateLocale } from "@/lib/preferences"
import { OFF_ENABLED } from "@/lib/config"
import { todayInZone } from "@/lib/date"

import { MealsView } from "./_components/meals-view"
import { WeightTrendSection } from "./_components/weight-trend-section"

/** How far back the trend looks: thirteen weeks of weigh-ins. */
const TREND_DAYS = 91

export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  const {
    timeZone,
    dateFormat,
    weightUnit,
    trackWeight,
    goalWeightLb,
    dashboardCollapsed,
  } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today

  // One Promise.all, deliberately: these are nine independent reads against the same
  // connection pool, and a stray serial await here turns a fast page slow.
  const [
    entries,
    foods,
    targets,
    targetHistory,
    recent,
    waterLogs,
    weight,
    weightRows,
    savedMealRows,
  ] = await Promise.all([
    getMealEntries(date),
    getFoods(),
    // The targets in effect on the viewed day, not simply "the user's targets".
    getMacroTargets(date),
    getMacroTargetHistory(),
    getRecentEntries(),
    getWaterLogs(date),
    // Not read at all with tracking off — the card and the chart are gone, so nothing
    // would look at them. The rows stay in the table for the day it is turned back on.
    trackWeight ? getBodyWeight(date) : null,
    trackWeight ? getWeightTrend(date, TREND_DAYS) : [],
    getSavedMeals(),
  ])
  const quickPicks = recentFrequentFoods(recent)
  // An item follows its library food (ADR-0026): resolved here, once, against the library
  // this page already read, so the strip, the list and the editor all show exactly what
  // logging the meal would write.
  const foodsById = new Map(foods.map((food) => [food.id, food] as const))
  const savedMeals = savedMealRows.map((meal) => ({
    ...meal,
    items: resolveSavedMealItems(meal.items, foodsById),
  }))
  const trend = weightTrend(weightRows, date, TREND_DAYS)
  const readout = weightReadout(trend, goalWeightLb)

  return (
    <MealsView
      date={date}
      today={today}
      entries={entries}
      foods={foods}
      targets={targets}
      targetHistory={targetHistory}
      quickPicks={quickPicks}
      savedMeals={savedMeals}
      waterLogs={waterLogs}
      trackWeight={trackWeight}
      weight={weight}
      weightReadout={readout}
      // Rendered here, on the server, so its SVG chart stays a server component.
      weightTrend={
        trackWeight ? (
          <WeightTrendSection
            trend={trend}
            readout={readout}
            locale={dateLocale(dateFormat)}
            unit={weightUnit}
            collapsed={dashboardCollapsed.includes("weight")}
          />
        ) : null
      }
      // Read here, on the server. A client component must never touch process.env —
      // it would be inlined at build time and shipped to the browser.
      offEnabled={OFF_ENABLED}
    />
  )
}
