"use client"

import { MoreVertical, Pencil, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { accentForCalendar } from "@/lib/colors"
import { formatTime } from "@/lib/format"
import type {
  Calendar,
  EventOccurrence,
  EventRow,
} from "@/modules/calendar/queries"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function formatDayHeading(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number)
  const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  return date === today ? `Today · ${label}` : label
}

export function AgendaView({
  occurrences,
  month,
  today,
  calendars,
  onEditEvent,
  onDelete,
}: {
  occurrences: EventOccurrence[]
  month: string
  today: string
  calendars: Calendar[]
  onEditEvent: (occ: EventOccurrence) => void
  onDelete: (event: EventRow) => void
}) {
  const { use24HourTime } = usePreferences()
  const groups: { date: string; items: EventOccurrence[] }[] = []
  for (const occ of occurrences.filter((o) => o.date.slice(0, 7) === month)) {
    const last = groups.at(-1)
    if (!last || last.date !== occ.date) {
      groups.push({ date: occ.date, items: [occ] })
    } else {
      last.items.push(occ)
    }
  }

  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        Nothing scheduled this month.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.date}>
          <h2 className="mb-2 text-sm font-semibold">
            {formatDayHeading(group.date, today)}
          </h2>
          <div className="flex flex-col gap-2">
            {group.items.map((occ, i) => (
              <div
                key={`${occ.event.id}-${i}`}
                className={cn(
                  "bg-card flex items-center gap-3 rounded-lg border border-l-2 p-3",
                  accentForCalendar(occ.event.calendarId, calendars, occ.event.id)
                    .border,
                )}
              >
                <span className="text-muted-foreground w-16 shrink-0 text-xs tabular-nums">
                  {occ.time ? formatTime(occ.time, use24HourTime) : "All day"}
                </span>
                <button
                  type="button"
                  onClick={() => onEditEvent(occ)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium">
                    {occ.event.title}
                  </span>
                  {occ.event.notes && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {occ.event.notes}
                    </span>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Event actions"
                      />
                    }
                  >
                    <MoreVertical className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEditEvent(occ)}>
                      <Pencil className="size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(occ.seriesEvent)}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
