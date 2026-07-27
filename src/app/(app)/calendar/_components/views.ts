// The calendar's four views, and the URL they live in. Shared between the server page
// (which validates `?view=`/`?date=` and picks a query to run) and the client view
// (which renders the switcher and the prev/next links), so neither can drift from the
// other's idea of what a valid view is.
//
// View and date are both in the URL rather than in component state or a preference:
// a week is then linkable, survives a reload, and works with the browser's own back
// button — none of which a `useState` toggle gives you.

import { addDays, dowOf, shiftMonth } from "@/lib/date"
import { weekDates } from "@/modules/calendar/service"

export const CALENDAR_VIEWS = ["month", "week", "day", "agenda"] as const
export type CalendarViewKind = (typeof CALENDAR_VIEWS)[number]

/** A `?view=` value, or "month" for anything unrecognised. */
export function parseView(value: string | undefined): CalendarViewKind {
  return CALENDAR_VIEWS.includes(value as CalendarViewKind)
    ? (value as CalendarViewKind)
    : "month"
}

/** The URL for a view of a date. "month" is the default, so it stays out of the query
 *  and `/calendar` remains the canonical link to today. */
export function calendarHref(view: CalendarViewKind, date: string): string {
  const params = new URLSearchParams()
  if (view !== "month") params.set("view", view)
  params.set("date", date)
  return `/calendar?${params}`
}

/** The date one step forward or back, in whatever unit the view steps in. */
export function shiftForView(
  view: CalendarViewKind,
  date: string,
  delta: number,
): string {
  if (view === "day") return addDays(date, delta)
  if (view === "week") return addDays(date, delta * 7)
  // Month and agenda step a month at a time. Keeping the day-of-month would land on
  // the 31st of a month that has none, so both anchor on the 1st.
  return `${shiftMonth(date.slice(0, 7), delta)}-01`
}

function formatDay(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  })
}

/** The heading between the prev/next arrows. */
export function viewTitle(
  view: CalendarViewKind,
  date: string,
  weekStartsOn = 0,
): string {
  if (view === "day") {
    return formatDay(date, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  }
  if (view === "week") {
    const week = weekDates(date, weekStartsOn)
    const [start, end] = [week[0], week[6]]
    // Drop the repeated half: same month → "12 – 18 July 2026"; across a month
    // boundary → "26 July – 1 August 2026"; across a year → both years spelled out.
    const sameYear = start.slice(0, 4) === end.slice(0, 4)
    const sameMonth = sameYear && start.slice(0, 7) === end.slice(0, 7)
    const from = formatDay(start, {
      day: "numeric",
      month: sameMonth ? undefined : "long",
      year: sameYear ? undefined : "numeric",
    })
    const to = formatDay(end, {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    return `${from} – ${to}`
  }
  return formatDay(date, { month: "long", year: "numeric" })
}

/** Whether `date` is the period the view would show for `today` — used to decide if a
 *  "back to today" link is worth offering. */
export function isCurrentPeriod(
  view: CalendarViewKind,
  date: string,
  today: string,
  weekStartsOn = 0,
): boolean {
  if (view === "day") return date === today
  if (view === "week") {
    const lead = (dowOf(today) - weekStartsOn + 7) % 7
    const start = addDays(today, -lead)
    return date >= start && date <= addDays(start, 6)
  }
  return date.slice(0, 7) === today.slice(0, 7)
}
