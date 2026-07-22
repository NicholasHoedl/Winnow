"use client"

import { MoreVertical, Pencil, Trash2 } from "lucide-react"

import type { EventOccurrence, EventRow } from "@/modules/calendar/queries"
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
  onEditEvent,
  onDelete,
}: {
  occurrences: EventOccurrence[]
  month: string
  today: string
  onEditEvent: (event: EventRow) => void
  onDelete: (event: EventRow) => void
}) {
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
                className="bg-card flex items-center gap-3 rounded-lg border p-3"
              >
                <span className="text-muted-foreground w-16 shrink-0 text-xs tabular-nums">
                  {occ.time ?? "All day"}
                </span>
                <button
                  type="button"
                  onClick={() => onEditEvent(occ.event)}
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
                    <DropdownMenuItem onClick={() => onEditEvent(occ.event)}>
                      <Pencil className="size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(occ.event)}
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
