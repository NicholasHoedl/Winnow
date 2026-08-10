"use client"

// The dashboard's agenda: overdue tasks pinned above one merged, time-ordered list of
// today's events and due tasks. Tasks stay checkable here (optimistic, like the
// dashboard task list); tapping anything else jumps to the module that owns it.
//
// This was the whole body of a separate `/today` route until that page was folded into
// the dashboard. The two ran five of the same queries and shared a header, a capture bar
// and the stat cards — the agenda was the only thing one had that the other didn't.

import * as React from "react"
import Link from "next/link"
import { CalendarDays, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { accentForCalendar } from "@/lib/colors"
import { formatTime } from "@/lib/format"
import type { Calendar, EventOccurrence } from "@/modules/calendar/queries"
import { toggleTaskStatus } from "@/modules/todos/actions"
import type { TaskWithSeries } from "@/modules/todos/queries"
import { Checkbox } from "@/components/ui/checkbox"

import type { AgendaItem } from "../_lib/agenda"

/** Fixed-width leading gutter so event times and task checkboxes share an axis and
 * every title starts at the same x. */
function Gutter({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex w-14 shrink-0 items-center justify-end">
      {children}
    </span>
  )
}

function TaskRow({
  task,
  done,
  onToggle,
}: {
  task: TaskWithSeries
  done: boolean
  onToggle: () => void
}) {
  return (
    <div className="hover:bg-accent flex items-center gap-2.5 rounded-md py-1.5 pr-2 transition-colors">
      <Gutter>
        <Checkbox
          checked={done}
          onCheckedChange={onToggle}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        />
      </Gutter>
      <Link
        href="/activity"
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          done && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </Link>
    </div>
  )
}

function EventRow({
  occurrence,
  calendars,
  use24Hour,
}: {
  occurrence: EventOccurrence
  calendars: Calendar[]
  use24Hour: boolean
}) {
  const accent = accentForCalendar(
    occurrence.event.calendarId,
    calendars,
    occurrence.event.id,
  )
  return (
    <Link
      href="/calendar"
      className={cn(
        "hover:bg-accent flex items-center gap-2.5 rounded-md border-l-2 py-1.5 pr-2 transition-colors",
        accent.tint,
        accent.border,
      )}
    >
      <Gutter>
        <span className="text-muted-foreground text-xs tabular-nums">
          {occurrence.time ? formatTime(occurrence.time, use24Hour) : "all-day"}
        </span>
      </Gutter>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {occurrence.event.title}
      </span>
    </Link>
  )
}

export function TodayAgenda({
  overdue,
  items,
  calendars,
  use24Hour,
}: {
  overdue: TaskWithSeries[]
  items: AgendaItem<TaskWithSeries, EventOccurrence>[]
  calendars: Calendar[]
  use24Hour: boolean
}) {
  const [toggledIds, addToggle] = React.useOptimistic<string[], string>(
    [],
    (state, id) => [...state, id],
  )
  const [, startTransition] = React.useTransition()

  function toggle(id: string) {
    startTransition(async () => {
      addToggle(id)
      const result = await toggleTaskStatus(id)
      if (!result.ok) toast.error(result.error)
    })
  }

  // A pending toggle flips the row; the server's status wins once it lands.
  function isDone(task: TaskWithSeries): boolean {
    return toggledIds.includes(task.id)
      ? task.status !== "done"
      : task.status === "done"
  }

  if (overdue.length === 0 && items.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center">
        <Sparkles className="size-6 opacity-60" />
        <p className="text-sm">
          Nothing due and nothing scheduled. The day is yours.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {overdue.length > 0 && (
        <section
          aria-labelledby="overdue-heading"
          className="border-destructive/30 bg-destructive/[0.04] rounded-xl border p-4"
        >
          <div className="mb-2 flex items-baseline justify-between">
            <h2
              id="overdue-heading"
              className="text-destructive text-sm font-semibold"
            >
              Overdue
            </h2>
            <span className="text-muted-foreground text-xs tabular-nums">
              {overdue.length}
            </span>
          </div>
          {/* Capped so a long-overdue backlog scrolls here rather than pushing the
              rest of the dashboard below the fold. */}
          <ol className="flex max-h-[22svh] flex-col gap-0.5 overflow-y-auto">
            {overdue.map((task) => (
              <li key={task.id}>
                <TaskRow
                  task={task}
                  done={isDone(task)}
                  onToggle={() => toggle(task.id)}
                />
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="agenda-heading">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="agenda-heading" className="text-sm font-semibold">
            Agenda
          </h2>
          <Link
            href="/calendar"
            className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
          >
            Calendar →
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm">
            <CalendarDays className="size-4 opacity-60" />
            Nothing scheduled or due today.
          </p>
        ) : (
          <ol className="flex max-h-[34svh] flex-col gap-0.5 overflow-y-auto">
            {items.map((item, i) => (
              <li key={item.kind === "task" ? item.task.id : `event-${i}`}>
                {item.kind === "task" ? (
                  <TaskRow
                    task={item.task}
                    done={isDone(item.task)}
                    onToggle={() => toggle(item.task.id)}
                  />
                ) : (
                  <EventRow
                    occurrence={item.occurrence}
                    calendars={calendars}
                    use24Hour={use24Hour}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
