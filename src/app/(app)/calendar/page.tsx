import { APP_TIME_ZONE } from "@/lib/config"
import { getGoals, getMonthEvents } from "@/modules/calendar/queries"
import { todayInZone } from "@/modules/todos/service"

import { CalendarView } from "./_components/calendar-view"

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const today = todayInZone(new Date(), APP_TIME_ZONE)
  const currentMonth = today.slice(0, 7)
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentMonth

  const [{ grid, byDay, occurrences }, goals] = await Promise.all([
    getMonthEvents(month),
    getGoals(),
  ])

  return (
    <CalendarView
      month={month}
      today={today}
      timeZone={APP_TIME_ZONE}
      grid={grid}
      byDay={byDay}
      occurrences={occurrences}
      goals={goals}
    />
  )
}
