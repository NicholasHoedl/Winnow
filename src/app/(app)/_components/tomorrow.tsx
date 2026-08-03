import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { accentForCalendar } from "@/lib/colors"
import { formatTime } from "@/lib/format"
import type { Calendar, EventOccurrence } from "@/modules/calendar/queries"
import { Panel } from "@/components/shared/panel"

// Tomorrow's events, and only tomorrow's.
//
// This was `UpNext`, which showed today AND tomorrow plus a fallback hero counting
// pending tasks. Everything except tomorrow now belongs to the agenda at the top of the
// dashboard, which says it better — merged with the tasks due today and ordered by time.
// Leaving the rest here would have printed the same events twice on one page, which is
// the duplication that folding `/today` in was meant to remove.
//
// Tomorrow survives because it is the one thing the agenda genuinely cannot tell you: it
// is built from a single day's occurrences by construction.

function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function Tomorrow({
  date,
  events,
  calendars,
  use24Hour,
}: {
  date: string
  events: EventOccurrence[]
  calendars: Calendar[]
  use24Hour: boolean
}) {
  return (
    <Panel>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Tomorrow{" "}
          <span className="text-muted-foreground font-normal">
            {shortDate(date)}
          </span>
        </h2>
        <Link
          href="/calendar"
          className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1 text-xs font-medium transition-colors"
        >
          Calendar
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-muted-foreground/70 text-sm">Nothing scheduled</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {events.map((occ, i) => {
            const accent = accentForCalendar(
              occ.event.calendarId,
              calendars,
              occ.event.id,
            )
            return (
              <li key={`${occ.event.id}-${i}`}>
                <Link
                  href="/calendar"
                  className={cn(
                    "hover:bg-accent flex items-center gap-2.5 rounded-md border-l-2 py-1 pr-2 pl-2.5 transition-colors",
                    accent.tint,
                    accent.border,
                  )}
                >
                  <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
                    {occ.time ? formatTime(occ.time, use24Hour) : "all-day"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {occ.event.title}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
