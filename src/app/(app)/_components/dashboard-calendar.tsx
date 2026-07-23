"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { accentForKey } from "@/lib/colors"
import { formatTime } from "@/lib/format"
import type { EventOccurrence } from "@/modules/calendar/queries"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

// Sunday-indexed absolute day names (the week view looks these up by getUTCDay).
const ABSOLUTE_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_MAX_CHIPS = 3

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

function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function EventChip({
  occ,
  onOpen,
  use24Hour,
  withTime,
}: {
  occ: EventOccurrence
  onOpen: (e: React.MouseEvent) => void
  use24Hour: boolean
  withTime?: boolean
}) {
  const accent = accentForKey(occ.event.id)
  return (
    <button
      type="button"
      onClick={onOpen}
      title={chipLabel(occ, use24Hour)}
      className={cn(
        "truncate rounded border-l-2 px-1.5 py-1 text-left text-[0.7rem] leading-tight transition-opacity hover:opacity-80",
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
  use24Hour,
  onDay,
  onEvent,
}: {
  grid: string[][]
  byDay: Record<string, EventOccurrence[]>
  month: string
  today: string
  headers: string[]
  use24Hour: boolean
  onDay: (date: string) => void
  onEvent: (e: React.MouseEvent) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-muted/40 grid grid-cols-7 border-b">
        {headers.map((d) => (
          <div
            key={d}
            className="text-muted-foreground p-1.5 text-center text-xs font-medium"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.flat().map((date) => {
          const inMonth = date.slice(0, 7) === month
          const isToday = date === today
          const dayEvents = byDay[date] ?? []
          return (
            <div
              key={date}
              onClick={() => onDay(date)}
              className={cn(
                "hover:bg-accent/40 flex min-h-20 cursor-pointer flex-col gap-1 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0",
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

function WeekView({
  weekRow,
  byDay,
  today,
  use24Hour,
  onDay,
  onEvent,
}: {
  weekRow: string[]
  byDay: Record<string, EventOccurrence[]>
  today: string
  use24Hour: boolean
  onDay: (date: string) => void
  onEvent: (e: React.MouseEvent) => void
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[38rem] grid-cols-7 gap-2">
        {weekRow.map((date) => {
          const isToday = date === today
          const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
          const dayEvents = byDay[date] ?? []
          return (
            <div key={date} className="flex min-w-0 flex-col gap-1.5">
              <button
                type="button"
                onClick={() => onDay(date)}
                className={cn(
                  "hover:bg-accent flex flex-col items-center rounded-lg py-1.5 transition-colors",
                  isToday && "bg-brand-accent text-brand-accent-foreground",
                )}
              >
                <span className="text-[0.65rem] font-medium uppercase">
                  {ABSOLUTE_WEEKDAYS[dow]}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {Number(date.slice(8))}
                </span>
              </button>
              <div className="flex flex-col gap-1">
                {dayEvents.length === 0 ? (
                  <span className="text-muted-foreground/30 py-1 text-center text-xs">
                    –
                  </span>
                ) : (
                  dayEvents.map((occ, i) => (
                    <EventChip
                      key={`${occ.event.id}-${i}`}
                      occ={occ}
                      onOpen={onEvent}
                      use24Hour={use24Hour}
                      withTime
                    />
                  ))
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
}: {
  month: string
  today: string
  grid: string[][]
  byDay: Record<string, EventOccurrence[]>
}) {
  const router = useRouter()
  const { weekStartsOn, use24HourTime } = usePreferences()
  const [view, setView] = React.useState<"month" | "week">("month")
  const weekRow = grid.find((w) => w[0] <= today && today <= w[6]) ?? grid[0]
  const headers = [
    ...ABSOLUTE_WEEKDAYS.slice(weekStartsOn),
    ...ABSOLUTE_WEEKDAYS.slice(0, weekStartsOn),
  ]

  const onDay = (date: string) =>
    router.push(`/calendar?month=${date.slice(0, 7)}`)
  const onEvent = (e: React.MouseEvent) => {
    e.stopPropagation()
    router.push("/calendar")
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {view === "month"
              ? monthLabel(month)
              : `${shortDate(weekRow[0])} – ${shortDate(weekRow[6])}`}
          </h2>
          <div className="flex items-center gap-2">
            <div className="bg-muted inline-flex rounded-lg p-0.5">
              {(["month", "week"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors",
                    view === v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <Link
              href="/calendar"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
            >
              Open
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {view === "month" ? (
          <MonthView
            grid={grid}
            byDay={byDay}
            month={month}
            today={today}
            headers={headers}
            use24Hour={use24HourTime}
            onDay={onDay}
            onEvent={onEvent}
          />
        ) : (
          <WeekView
            weekRow={weekRow}
            byDay={byDay}
            today={today}
            use24Hour={use24HourTime}
            onDay={onDay}
            onEvent={onEvent}
          />
        )}
      </CardContent>
    </Card>
  )
}
