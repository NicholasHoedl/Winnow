import Link from "next/link"
import { CalendarPlus } from "lucide-react"

import { cn } from "@/lib/utils"
import { accentForKey } from "@/lib/colors"
import { formatTime } from "@/lib/format"
import type { EventOccurrence } from "@/modules/calendar/queries"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function TodayTimeline({
  events,
  use24Hour,
}: {
  events: EventOccurrence[]
  use24Hour: boolean
}) {
  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Today&apos;s schedule</span>
          {events.length > 0 && (
            <span className="text-muted-foreground text-xs font-normal tabular-nums">
              {events.length} {events.length === 1 ? "event" : "events"}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
              <CalendarPlus className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Nothing scheduled today</p>
              <p className="text-muted-foreground text-sm">
                A clear day — or time to plan one.
              </p>
            </div>
            <Link
              href="/calendar"
              className="text-primary text-sm font-medium underline-offset-4 hover:underline"
            >
              Add an event →
            </Link>
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {events.map((occ, i) => {
              const accent = accentForKey(occ.event.id)
              return (
                <li key={`${occ.event.id}-${i}`}>
                  <Link href="/calendar" className="flex items-stretch gap-3">
                    <span className="text-muted-foreground w-14 shrink-0 pt-2 text-right text-xs tabular-nums">
                      {occ.time ? formatTime(occ.time, use24Hour) : "all-day"}
                    </span>
                    <span
                      className={cn(
                        "hover:bg-accent min-w-0 flex-1 rounded-lg border-l-2 px-3 py-2 transition-colors",
                        accent.tint,
                        accent.border,
                      )}
                    >
                      <span className="block truncate text-sm font-medium">
                        {occ.event.title}
                      </span>
                      {occ.event.notes && (
                        <span className="text-muted-foreground block truncate text-xs">
                          {occ.event.notes}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
