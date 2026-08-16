// The calendar's four views, and the URL they live in. Shared between the server page
// (which validates `?view=`/`?date=` and picks a query to run) and the client view
// (which renders the switcher and the prev/next links), so neither can drift from the
// other's idea of what a valid view is.
//
// View and date are both in the URL rather than in component state: a week is then
// linkable, survives a reload, and works with the browser's own back button — none of which
// a `useState` toggle gives you. What the URL does NOT say is now answered by the
// `defaultCalendarView` preference, which only ever supplies the starting point; an explicit
// `?view=` always wins, so every link and bookmark keeps meaning what it meant.

import { addDays, dowOf, shiftMonth } from "@/lib/date"
import type { CalendarView } from "@/lib/preferences"
import { weekDates } from "@/modules/calendar/service"

export const CALENDAR_VIEWS = ["month", "week", "day", "agenda"] as const

/**
 * The four views.
 *
 * Aliased to `CalendarView` in `lib/preferences.ts` rather than declared twice: that file is
 * client-safe and imported by the server validation and query layer, which must not reach
 * into a route's `_components`. The alias is what keeps the two lists from drifting — widen
 * one and this stops compiling.
 */
export type CalendarViewKind = CalendarView

/**
 * A `?view=` value, falling back to `fallback` when it is absent or unrecognised.
 *
 * The fallback defaults to "month" so every call site that does not care keeps its old
 * behaviour; `/calendar` passes the user's preference.
 */
export function parseView(
  value: string | undefined,
  fallback: CalendarViewKind = "month",
): CalendarViewKind {
  return CALENDAR_VIEWS.includes(value as CalendarViewKind)
    ? (value as CalendarViewKind)
    : fallback
}

/**
 * The URL for a view of a date. **Always names the view, including "month".**
 *
 * It used to omit `view=month`, on the reasoning that month was the default and `/calendar`
 * was therefore the canonical link to today. Making the default configurable inverts that
 * exactly: for someone whose preference is the week, a bare `/calendar?date=…` resolves back
 * to the WEEK — so the month button would have produced a link that could not select the
 * month. The switcher has to be able to say "month" out loud.
 */
export function calendarHref(view: CalendarViewKind, date: string): string {
  const params = new URLSearchParams({ view, date })
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
