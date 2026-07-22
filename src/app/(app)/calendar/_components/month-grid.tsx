"use client"

import { cn } from "@/lib/utils"
import type { EventOccurrence, EventRow } from "@/modules/calendar/queries"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MAX_CHIPS = 3

function chipLabel(occ: EventOccurrence): string {
  return occ.time ? `${occ.time} ${occ.event.title}` : occ.event.title
}

export function MonthGrid({
  grid,
  byDay,
  month,
  today,
  onSelectDay,
  onEditEvent,
}: {
  grid: string[][]
  byDay: Record<string, EventOccurrence[]>
  month: string
  today: string
  onSelectDay: (date: string) => void
  onEditEvent: (event: EventRow) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="bg-muted/40 grid grid-cols-7 border-b">
        {WEEKDAYS.map((d) => (
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
                    "bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full",
                )}
              >
                {Number(date.slice(8))}
              </span>
              <div className="flex flex-col gap-0.5">
                {dayEvents.slice(0, MAX_CHIPS).map((occ, i) => (
                  <button
                    key={`${occ.event.id}-${i}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditEvent(occ.event)
                    }}
                    title={chipLabel(occ)}
                    className={cn(
                      "truncate rounded px-1 py-0.5 text-left text-[0.7rem] leading-tight",
                      occ.time
                        ? "bg-primary/10 text-foreground hover:bg-primary/20"
                        : "bg-primary/80 text-primary-foreground hover:bg-primary",
                    )}
                  >
                    {chipLabel(occ)}
                  </button>
                ))}
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
