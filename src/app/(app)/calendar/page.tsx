import { getCalendars, getMonthEvents } from "@/modules/calendar/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { todayInZone } from "@/lib/date"

import { CalendarView } from "./_components/calendar-view"

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const { timeZone, weekStartsOn } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const currentMonth = today.slice(0, 7)
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentMonth

  const [{ grid, byDay, occurrences }, calendars] = await Promise.all([
    getMonthEvents(month, timeZone, weekStartsOn),
    getCalendars(),
  ])

  return (
    <CalendarView
      month={month}
      today={today}
      timeZone={timeZone}
      grid={grid}
      byDay={byDay}
      occurrences={occurrences}
      calendars={calendars}
    />
  )
}
