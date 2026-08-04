"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { accentForCalendar } from "@/lib/colors"
import { formatTime } from "@/lib/format"
import type { Calendar, EventOccurrence } from "@/modules/calendar/queries"
import { weekDates } from "@/modules/calendar/service"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { TimeGrid } from "@/components/calendar/time-grid"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

// Sunday-indexed absolute day names (the week view looks these up by getUTCDay).
const ABSOLUTE_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_MAX_CHIPS = 2

export type DashboardCalendarView = "month" | "week"

/** e.g. "Aug 3 – 9" — and "Jul 28 – Aug 3" when the week straddles two months. */
function weekLabel(dates: string[]): string {
  const fmt = (d: string, withMonth: boolean) => {
    const [y, m, day] = d.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
      ...(withMonth ? { month: "short" } : {}),
      day: "numeric",
      timeZone: "UTC",
    })
  }
  const [first, last] = [dates[0], dates[6]]
  const sameMonth = first.slice(0, 7) === last.slice(0, 7)
  return `${fmt(first, true)} – ${fmt(last, !sameMonth)}`
}

function chipLabel(occ: EventOccurrence, use24Hour: boolean): string {
  return occ.time
    ? `${formatTime(occ.time, use24Hour)} ${occ.event.title}`
    : occ.event.title
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

function EventChip({
  occ,
  onOpen,
  calendars,
  use24Hour,
  withTime,
}: {
  occ: EventOccurrence
  onOpen: (e: React.MouseEvent) => void
  calendars: Calendar[]
  use24Hour: boolean
  withTime?: boolean
}) {
  const accent = accentForCalendar(
    occ.event.calendarId,
    calendars,
    occ.event.id,
  )
  return (
    <button
      type="button"
      onClick={onOpen}
      title={chipLabel(occ, use24Hour)}
      className={cn(
        "truncate rounded border-l-2 px-1.5 py-0.5 text-left text-[0.7rem] leading-tight transition-opacity hover:opacity-80 [@media(max-height:820px)]:py-0",
        accent.tint,
        accent.border,
      )}
    >
      {withTime && (
        <span className="text-muted-foreground block tabular-nums">
          {occ.time ? formatTime(occ.time, use24Hour) : "all-day"}
        </span>
      )}
      <span className="block truncate font-medium">
        {withTime ? occ.event.title : chipLabel(occ, use24Hour)}
      </span>
    </button>
  )
}

function MonthView({
  grid,
  byDay,
  month,
  today,
  headers,
  calendars,
  use24Hour,
  onDay,
  onEvent,
}: {
  grid: string[][]
  byDay: Record<string, EventOccurrence[]>
  month: string
  today: string
  headers: string[]
  calendars: Calendar[]
  use24Hour: boolean
  onDay: (date: string) => void
  onEvent: (e: React.MouseEvent) => void
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border">
      <div className="bg-muted/40 grid shrink-0 grid-cols-7 border-b">
        {headers.map((d) => (
          <div
            key={d}
            className="text-muted-foreground p-1.5 text-center text-xs font-medium"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr grid-cols-7">
        {grid.flat().map((date) => {
          const inMonth = date.slice(0, 7) === month
          const isToday = date === today
          const dayEvents = byDay[date] ?? []
          return (
            <div
              key={date}
              onClick={() => onDay(date)}
              className={cn(
                "hover:bg-accent/40 flex min-h-16 cursor-pointer flex-col gap-0.5 border-r border-b p-1 [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-muted/20 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium tabular-nums",
                  isToday &&
                    "bg-brand-accent text-brand-accent-foreground flex size-5 items-center justify-center rounded-full",
                )}
              >
                {Number(date.slice(8))}
              </span>
              <div className="flex flex-col gap-0.5">
                {dayEvents.slice(0, MONTH_MAX_CHIPS).map((occ, i) => (
                  <EventChip
                    key={`${occ.event.id}-${i}`}
                    occ={occ}
                    onOpen={onEvent}
                    calendars={calendars}
                    use24Hour={use24Hour}
                  />
                ))}
                {dayEvents.length > MONTH_MAX_CHIPS && (
                  <span className="text-muted-foreground px-1 text-[0.65rem]">
                    +{dayEvents.length - MONTH_MAX_CHIPS} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function DashboardCalendar({
  month,
  today,
  grid,
  byDay,
  calendars,
  view,
}: {
  month: string
  today: string
  grid: string[][]
  byDay: Record<string, EventOccurrence[]>
  calendars: Calendar[]
  view: DashboardCalendarView
}) {
  const router = useRouter()
  const { weekStartsOn, use24HourTime, timeZone } = usePreferences()
  const headers = [
    ...ABSOLUTE_WEEKDAYS.slice(weekStartsOn),
    ...ABSOLUTE_WEEKDAYS.slice(0, weekStartsOn),
  ]

  // The month grid spans the whole weeks overlapping this month, and today is always
  // inside it — so the week's events are already in `byDay` and the week view costs no
  // extra query.
  const week = weekDates(today, weekStartsOn)

  const onDay = (date: string) =>
    router.push(`/calendar?month=${date.slice(0, 7)}`)
  const onEvent = (e: React.MouseEvent) => {
    e.stopPropagation()
    router.push("/calendar")
  }

  return (
    <Card className="flex h-full flex-col gap-3 py-4">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {view === "week" ? weekLabel(week) : monthLabel(month)}
          </h2>
          <div className="flex items-center gap-2">
            {/*
              Links, not state. The server renders the chosen view, so there is no flash
              of the wrong one on load and no localStorage read during render — the same
              `?view=`/`?month=` idiom /calendar already uses. It does mean the dashboard
              opens on the month each visit; making the choice stick would mean a column
              on `user_preferences` so the server still knows it up front.
            */}
            <div
              role="group"
              aria-label="Calendar view"
              className="bg-muted flex items-center rounded-md p-0.5"
            >
              {(["month", "week"] as const).map((v) => (
                <Link
                  key={v}
                  href={v === "month" ? "/" : "/?calendar=week"}
                  aria-current={view === v ? "true" : undefined}
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium capitalize transition-colors",
                    view === v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v}
                </Link>
              ))}
            </div>
            <Link
              href={view === "week" ? "/calendar?view=week" : "/calendar"}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
            >
              Open
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        {view === "week" ? (
          /*
            The same grid /calendar?view=week renders, not a lookalike — so "where are the
            gaps" reads identically on both surfaces. `fill` is what makes it safe here:
            by default it sizes itself to 65svh, which on this height-budgeted column
            would push the whole page into scrolling. The shorter hour rows fit a useful
            slice of the day into the space the column actually has.

            Read-only: no `onReschedule`, so blocks are not draggable at all and clicking
            anything lands you on /calendar — which is what the chips did before.
          */
          <TimeGrid
            dates={week}
            byDay={byDay}
            today={today}
            timeZone={timeZone}
            calendars={calendars}
            onSelectDay={(date) =>
              router.push(`/calendar?view=week&date=${date}`)
            }
            onEditEvent={(occ) =>
              router.push(`/calendar?view=week&date=${occ.date}`)
            }
            fill
            /*
              What this column can actually spare, measured rather than guessed: the
              month view sits at 0px page overflow, and matching its card height means
              the viewport minus the page header, the quick-capture bar and this card's
              own chrome. `fill` alone does not cap anything here — see its doc.
            */
            maxHeight="calc(100svh - 21rem)"
            hourHeight="2.25rem"
          />
        ) : (
          <MonthView
            grid={grid}
            byDay={byDay}
            month={month}
            today={today}
            headers={headers}
            calendars={calendars}
            use24Hour={use24HourTime}
            onDay={onDay}
            onEvent={onEvent}
          />
        )}
      </CardContent>
    </Card>
  )
}
