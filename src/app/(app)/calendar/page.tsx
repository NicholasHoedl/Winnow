import {
  getCalendars,
  getMonthEvents,
  getRangeEvents,
} from "@/modules/calendar/queries"
import { bucketByDay, weekDates } from "@/modules/calendar/service"
import { getUserPreferences } from "@/modules/preferences/queries"
import { addDays, isValidDateString, todayInZone } from "@/lib/date"

import { CalendarView } from "./_components/calendar-view"
import { parseView } from "./_components/views"

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; month?: string }>
}) {
  const params = await searchParams
  const { timeZone, weekStartsOn, defaultCalendarView } =
    await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)

  // The preference is only the fallback: an explicit `?view=` still wins, so a bookmark or
  // a shared link shows what it always showed regardless of whose account opens it.
  const view = parseView(params.view, defaultCalendarView)

  // `?month=` predates `?date=` and is still what the dashboard mini-calendar and
  // search results link with, so it stays readable as the first of the month.
  const date =
    params.date && isValidDateString(params.date)
      ? params.date
      : params.month && /^\d{4}-\d{2}$/.test(params.month)
        ? `${params.month}-01`
        : today

  const calendars = await getCalendars()

  if (view === "week" || view === "day") {
    const dates = view === "week" ? weekDates(date, weekStartsOn) : [date]
    const occurrences = await getRangeEvents(
      dates[0],
      addDays(dates[dates.length - 1], 1),
      timeZone,
    )
    return (
      <CalendarView
        view={view}
        date={date}
        today={today}
        timeZone={timeZone}
        grid={[]}
        dates={dates}
        byDay={bucketByDay(occurrences)}
        occurrences={occurrences}
        calendars={calendars}
      />
    )
  }

  const month = date.slice(0, 7)
  const { grid, byDay, occurrences } = await getMonthEvents(
    month,
    timeZone,
    weekStartsOn,
  )
  return (
    <CalendarView
      view={view}
      date={date}
      today={today}
      timeZone={timeZone}
      grid={grid}
      dates={[]}
      byDay={byDay}
      occurrences={occurrences}
      calendars={calendars}
    />
  )
}
