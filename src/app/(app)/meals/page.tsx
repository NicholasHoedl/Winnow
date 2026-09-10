import {
  getBodyWeight,
  getFoods,
  getMacroTargetHistory,
  getMacroTargets,
  getMealEntries,
  getRecentEntries,
  getWaterLogs,
  getWeightTrend,
} from "@/modules/meals/queries"
import {
  recentFrequentFoods,
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
  const { timeZone, dateFormat, weightUnit, trackWeight, goalWeightLb } =
    await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today

  // One Promise.all, deliberately: these are eight independent reads against the same
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
  ])
  const quickPicks = recentFrequentFoods(recent)
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
          />
        ) : null
      }
      // Read here, on the server. A client component must never touch process.env —
      // it would be inlined at build time and shipped to the browser.
      offEnabled={OFF_ENABLED}
    />
  )
}
