"use client"

import * as React from "react"

import { accentForCalendar } from "@/lib/colors"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Calendar, EventOccurrence } from "@/modules/calendar/queries"
import { usePreferences } from "@/components/preferences/preferences-provider"

import {
  DAY_MINUTES,
  HOURS,
  daySpan,
  dstNotes,
  layoutLanes,
  minutesOf,
  spanFractions,
} from "./grid-geometry"

/** How often the now-line catches up. A minute is the finest the grid can show. */
const NOW_TICK_MS = 60_000

// The wall clock is an external, changing source rather than state derived from props,
// so it is read with useSyncExternalStore. That also gives it a server snapshot: the
// now-line is deliberately absent from the SSR markup, because rendering a clock
// during SSR guarantees a hydration mismatch the moment the minute turns over.
let nowSnapshot = 0

function readClock(): number {
  return Math.floor(Date.now() / NOW_TICK_MS) * NOW_TICK_MS
}

/** Cached so it is stable across the repeated calls React makes while rendering. */
function clientNow(): number | null {
  return nowSnapshot || null
}

function serverNow(): number | null {
  return null
}

function subscribeToClock(onChange: () => void): () => void {
  nowSnapshot = readClock()
  const id = setInterval(() => {
    nowSnapshot = readClock()
    onChange()
  }, NOW_TICK_MS)
  return () => clearInterval(id)
}

/** Where the scroll position starts, so the view opens on the working day instead of
 *  on an empty midnight. Overridden by the now-line when today is in view. */
const DEFAULT_SCROLL_HOUR = 7

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** Compact label for the hour gutter — "09:00" or "9 AM". `formatTime`'s "9:00 AM" is
 *  more than the column is wide, and the minutes are always zero here anyway. */
function hourLabel(hour: number, use24Hour: boolean): string {
  if (use24Hour) return `${pad2(hour)}:00`
  const period = hour < 12 ? "AM" : "PM"
  return `${hour % 12 === 0 ? 12 : hour % 12} ${period}`
}

/** "Wednesday 15 July" — the spoken form of a column, for event labels. */
function spokenDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
}

/** What a screen reader hears instead of a coloured rectangle at a certain height. The
 *  hour gutter is decoration — it cannot be associated with an absolutely positioned
 *  block in any way a reader would follow — so each event states its own time. */
function eventLabel(
  occ: EventOccurrence,
  date: string,
  use24Hour: boolean,
): string {
  const when = occ.time
    ? occ.endTime
      ? `${formatTime(occ.time, use24Hour)} to ${formatTime(occ.endTime, use24Hour)}`
      : formatTime(occ.time, use24Hour)
    : "All day"
  const continues =
    occ.date !== date
      ? ", continued"
      : occ.endDate !== date
        ? ", continues"
        : ""
  return `${occ.event.title}, ${when}, ${spokenDate(date)}${continues}`
}

/**
 * The week/day time grid: an all-day gutter over 24 hour rows, one column per date.
 *
 * Blocks are positioned as percentages of their column rather than in pixels, so the
 * row height is a single CSS variable and nothing here has to measure anything.
 */
export function TimeGrid({
  dates,
  byDay,
  today,
  timeZone,
  calendars,
  onSelectDay,
  onEditEvent,
}: {
  dates: string[]
  byDay: Record<string, EventOccurrence[]>
  today: string
  timeZone: string
  calendars: Calendar[]
  onSelectDay?: (date: string) => void
  onEditEvent?: (occ: EventOccurrence) => void
}) {
  const { use24HourTime } = usePreferences()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const now = React.useSyncExternalStore(subscribeToClock, clientNow, serverNow)
  const showsToday = dates.includes(today)

  const nowMinutes = React.useMemo(() => {
    if (now === null || !showsToday) return null
    const wall = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(now))
    return minutesOf(wall === "24:00" ? "00:00" : wall)
  }, [now, showsToday, timeZone])

  // Open on something worth looking at rather than on an empty midnight. Once only:
  // re-running on every minute would yank the view back under anyone who scrolled away.
  const scrolled = React.useRef(false)
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el || scrolled.current) return
    // When today is on screen the clock decides where to open, so wait the one tick
    // for it rather than scrolling twice.
    if (nowMinutes === null && showsToday) return
    scrolled.current = true
    const target =
      nowMinutes === null
        ? DEFAULT_SCROLL_HOUR * 60
        : Math.max(0, nowMinutes - 90)
    el.scrollTop = (target / DAY_MINUTES) * el.scrollHeight
  }, [nowMinutes, showsToday])

  const allDayByDate = dates.map((date) =>
    (byDay[date] ?? []).filter((occ) => occ.time === null),
  )
  const hasAllDay = allDayByDate.some((list) => list.length > 0)

  return (
    <div className="overflow-hidden rounded-xl border [--gutter:3.5rem] [--hour-h:3rem]">
      {/* Column headers. */}
      <div className="bg-muted/40 flex border-b">
        <div className="w-(--gutter) shrink-0" />
        {dates.map((date) => {
          const isToday = date === today
          return (
            <div
              key={date}
              className="flex-1 border-l p-2 text-center first:border-l-0"
            >
              <div className="text-muted-foreground text-xs font-medium">
                {WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}
              </div>
              <div
                className={cn(
                  "mx-auto mt-0.5 text-sm font-semibold tabular-nums",
                  isToday &&
                    "bg-brand-accent text-brand-accent-foreground flex size-6 items-center justify-center rounded-full",
                )}
              >
                {Number(date.slice(8))}
              </div>
            </div>
          )
        })}
      </div>

      {/* All-day gutter. Hidden entirely when nothing is in it — an always-present
          empty strip reads as a broken row. */}
      {hasAllDay && (
        <div role="group" aria-label="All-day events" className="flex border-b">
          <div className="text-muted-foreground w-(--gutter) shrink-0 px-1 py-1.5 text-right text-[0.65rem] leading-tight">
            All-day
          </div>
          {dates.map((date, index) => (
            <div
              key={date}
              className="flex min-h-8 flex-1 flex-col gap-0.5 border-l p-1 first:border-l-0"
            >
              {allDayByDate[index].map((occ, i) => {
                const accent = accentForCalendar(
                  occ.event.calendarId,
                  calendars,
                  occ.event.id,
                )
                return (
                  <button
                    key={`${occ.seriesEvent.id}::${occ.date}-${i}`}
                    type="button"
                    onClick={() => onEditEvent?.(occ)}
                    aria-label={eventLabel(occ, date, use24HourTime)}
                    className={cn(
                      "text-foreground truncate rounded border-l-2 px-1 py-0.5 text-left text-[0.7rem] leading-tight transition-opacity hover:opacity-80",
                      accent.tint,
                      accent.border,
                    )}
                  >
                    {occ.event.title}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Hour rows. */}
      <div ref={scrollRef} className="max-h-[65vh] overflow-y-auto">
        <div className="flex h-[calc(24*var(--hour-h))]">
          {/* The gutter is decoration: its labels sit beside absolutely positioned
              blocks and cannot be associated with them, so every event carries its own
              time in `eventLabel` instead and this column is hidden from readers. */}
          <div aria-hidden className="w-(--gutter) shrink-0">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="text-muted-foreground relative h-(--hour-h) pr-1.5 text-right text-[0.65rem]"
              >
                {hour > 0 && (
                  <span className="absolute top-0 right-1.5 -translate-y-1/2">
                    {hourLabel(hour, use24HourTime)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {dates.map((date) => (
            <DayColumn
              key={date}
              date={date}
              today={today}
              timeZone={timeZone}
              occurrences={byDay[date] ?? []}
              calendars={calendars}
              nowMinutes={date === today ? nowMinutes : null}
              use24Hour={use24HourTime}
              onSelectDay={onSelectDay}
              onEditEvent={onEditEvent}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayColumn({
  date,
  today,
  timeZone,
  occurrences,
  calendars,
  nowMinutes,
  use24Hour,
  onSelectDay,
  onEditEvent,
}: {
  date: string
  today: string
  timeZone: string
  occurrences: EventOccurrence[]
  calendars: Calendar[]
  nowMinutes: number | null
  use24Hour: boolean
  onSelectDay?: (date: string) => void
  onEditEvent?: (occ: EventOccurrence) => void
}) {
  // Timed occurrences only; the all-day ones are already in the gutter above. The
  // clamp is per column because bucketByDay hands every day the SAME object for a
  // multi-day span — this column has to work out which slice is its own.
  const placed = occurrences
    .map((occ) => ({ occ, span: daySpan(occ, date) }))
    .filter(
      (
        entry,
      ): entry is {
        occ: EventOccurrence
        span: NonNullable<typeof entry.span>
      } => entry.span !== null,
    )
  const lanes = layoutLanes(placed.map((entry) => entry.span))
  const { skipped } = dstNotes(date, timeZone)

  return (
    <div
      className={cn(
        "relative flex-1 border-l first:border-l-0",
        date === today && "bg-brand-accent/5",
      )}
    >
      {/* Hour cells: the gridlines, and the click target for creating on this day. */}
      {HOURS.map((hour) => (
        <div
          key={hour}
          onClick={() => onSelectDay?.(date)}
          className={cn(
            "hover:bg-accent/40 h-(--hour-h) border-b last:border-b-0",
            // An hour the clock springs over. Nothing can be scheduled in it, so say
            // so rather than leaving an ordinary-looking row nobody can use.
            skipped.includes(hour) &&
              "bg-muted/60 [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,var(--color-border)_4px,var(--color-border)_5px)]",
          )}
          title={
            skipped.includes(hour)
              ? "Clocks go forward — this hour does not exist"
              : undefined
          }
        />
      ))}

      {/* Event blocks, floating over the cells. */}
      <div className="pointer-events-none absolute inset-0">
        {placed.map(({ occ, span }, index) => {
          const { top, height } = spanFractions(span)
          const lane = lanes[index]
          const accent = accentForCalendar(
            occ.event.calendarId,
            calendars,
            occ.event.id,
          )
          return (
            <button
              key={`${occ.seriesEvent.id}::${occ.date}-${index}`}
              type="button"
              onClick={() => onEditEvent?.(occ)}
              aria-label={eventLabel(occ, date, use24Hour)}
              style={{
                top: `${top * 100}%`,
                height: `${height * 100}%`,
                left: `${lane.left * 100}%`,
                width: `${lane.width * 100}%`,
              }}
              className={cn(
                "pointer-events-auto absolute overflow-hidden rounded border border-l-2 px-1 py-0.5 text-left text-[0.7rem] leading-tight transition-opacity hover:opacity-80",
                accent.tint,
                accent.border,
              )}
            >
              <span className="block truncate font-medium">
                {occ.event.title}
              </span>
              {occ.time && height > 0.03 && (
                <span className="text-muted-foreground block truncate">
                  {formatTime(occ.time, use24Hour)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {nowMinutes !== null && (
        <div
          aria-hidden
          style={{ top: `${(nowMinutes / DAY_MINUTES) * 100}%` }}
          className="bg-brand-accent pointer-events-none absolute inset-x-0 h-px"
        >
          <span className="bg-brand-accent absolute -top-1 -left-1 size-2 rounded-full" />
        </div>
      )}
    </div>
  )
}
