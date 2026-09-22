// About this file: the page component for /calendar, a server component. It works out
// the view and date from the URL, loads the calendars and the events that view shows,
// and hands them to the client calendar view.
//
// What you'll find here:
// - `CalendarPage` (default export): reads the user's preferences, then `?view=`
//   (falling back to their default view) and `?date=` (or the older `?month=`, or today).
// - Loads, in parallel: the calendars, event counts per calendar, and the occurrences,
//   from `getRangeEvents` for week and day or `getMonthEvents` for month and agenda.
// - Renders: `CalendarView` with the month grid or the day columns, the occurrences
//   bucketed by day, and the calendars.
//
// Related: `_components/calendar-view.tsx`, the client component that draws every view.

import {
  getCalendarEventCounts,
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

  // Which days the view asks for, decided before anything is fetched so the three reads
  // below can start together.
  const dates =
    view === "week"
      ? weekDates(date, weekStartsOn)
      : view === "day"
        ? [date]
        : []

  // One await where there were three (T45). The calendars, the per-calendar counts and the
  // occurrences are independent — none of them reads anything another returns — and running
  // them one after the other cost ~30ms of serial round trips inside an 85ms document.
  const [calendars, eventCounts, events] = await Promise.all([
    getCalendars(),
    // For the manager's delete confirmation only; see `getCalendarEventCounts`.
    getCalendarEventCounts(),
    dates.length > 0
      ? getRangeEvents(
          dates[0],
          addDays(dates[dates.length - 1], 1),
          timeZone,
        ).then((occurrences) => ({
          // Week and day draw a time grid, not a month grid.
          grid: [],
          byDay: bucketByDay(occurrences),
          occurrences,
        }))
      : getMonthEvents(date.slice(0, 7), timeZone, weekStartsOn),
  ])

  return (
    <CalendarView
      view={view}
      date={date}
      today={today}
      timeZone={timeZone}
      grid={events.grid}
      dates={dates}
      byDay={events.byDay}
      occurrences={events.occurrences}
      calendars={calendars}
      eventCounts={eventCounts}
    />
  )
}
