"use client"

import { cn } from "@/lib/utils"
import { accentForCalendar } from "@/lib/colors"
import { formatTime } from "@/lib/format"
import type { Calendar, EventOccurrence } from "@/modules/calendar/queries"
import { usePreferences } from "@/components/preferences/preferences-provider"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MAX_CHIPS = 3

/**
 * What the chip SAYS, and the title comes first.
 *
 * It used to lead with the time, which meant that in a month cell — about 62px wide at
 * 1440px and narrower on a phone — every chip truncated to the clock and nothing else:
 * `6:0…`, `2:0…`, `10:0…`. A grid full of times you already know are today, tomorrow and
 * Friday, and not one of them saying what it is.
 *
 * Ordering it title-first makes truncation degrade in the useful direction: a wide cell
 * still shows both, a narrow one keeps as much of the name as fits, and the time is the part
 * that falls off — recoverable from the tooltip below, from the chip's position in the day's
 * order, and from opening it.
 */
function chipText(occ: EventOccurrence, use24Hour: boolean): string {
  return occ.time
    ? `${occ.event.title} ${formatTime(occ.time, use24Hour)}`
    : occ.event.title
}

/** The hover tooltip, where there is room, so time-first still reads best. */
function chipTooltip(occ: EventOccurrence, use24Hour: boolean): string {
  return occ.time
    ? `${formatTime(occ.time, use24Hour)} ${occ.event.title}`
    : occ.event.title
}

export function MonthGrid({
  grid,
  byDay,
  month,
  today,
  calendars,
  onSelectDay,
  onEditEvent,
}: {
  grid: string[][]
  byDay: Record<string, EventOccurrence[]>
  month: string
  today: string
  calendars: Calendar[]
  onSelectDay: (date: string) => void
  onEditEvent: (occ: EventOccurrence) => void
}) {
  const { weekStartsOn, use24HourTime } = usePreferences()
  const headers = [
    ...WEEKDAYS.slice(weekStartsOn),
    ...WEEKDAYS.slice(0, weekStartsOn),
  ]
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="bg-muted/40 grid grid-cols-7 border-b">
        {headers.map((d) => (
          <div
            key={d}
            className="text-muted-foreground p-2 text-center text-xs font-medium"
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
              onClick={() => onSelectDay(date)}
              className={cn(
                "hover:bg-accent/40 flex min-h-24 cursor-pointer flex-col gap-1 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0",
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
                {dayEvents.slice(0, MAX_CHIPS).map((occ, i) => {
                  const accent = accentForCalendar(
                    occ.event.calendarId,
                    calendars,
                    occ.event.id,
                  )
                  return (
                    <button
                      key={`${occ.event.id}-${i}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditEvent(occ)
                      }}
                      title={chipTooltip(occ, use24HourTime)}
                      className={cn(
                        "text-foreground truncate rounded border-l-2 px-1 py-0.5 text-left text-[0.7rem] leading-tight transition-opacity hover:opacity-80",
                        accent.tint,
                        accent.border,
                      )}
                    >
                      {chipText(occ, use24HourTime)}
                    </button>
                  )
                })}
                {dayEvents.length > MAX_CHIPS && (
                  <span className="text-muted-foreground px-1 text-[0.65rem]">
                    +{dayEvents.length - MAX_CHIPS} more
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
