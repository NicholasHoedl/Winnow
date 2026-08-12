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
import { CalendarDays, ListChecks, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { accentForCalendar } from "@/lib/colors"
import { formatTime } from "@/lib/format"
import type { Calendar, EventOccurrence } from "@/modules/calendar/queries"
import { reorderTasks, toggleTaskStatus } from "@/modules/todos/actions"
import type { TaskWithSeries } from "@/modules/todos/queries"
import { SortableList } from "@/components/shared/sortable-list"
import { Checkbox } from "@/components/ui/checkbox"

import type { AgendaGroup, AgendaItem } from "../_lib/agenda"

/** Key for the ungrouped tasks in the local order overlay. Not a valid uuid, so it can
 *  never collide with a routine id. */
const LOOSE = "loose"

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

/**
 * One draggable run of task rows.
 *
 * At module level rather than inside `TodayAgenda`, which is what the linter is right
 * about: a component declared during render is a new type on every pass, so React
 * remounts its whole subtree — and here that subtree owns a DndContext mid-drag.
 */
function TaskList({
  rows,
  isDone,
  onToggle,
  onReorder,
}: {
  rows: TaskWithSeries[]
  isDone: (task: TaskWithSeries) => boolean
  onToggle: (id: string) => void
  onReorder: (ids: string[]) => void
}) {
  return (
    <SortableList
      items={rows}
      onReorder={onReorder}
      labelFor={(task) => task.title}
      className="flex flex-col gap-0.5"
      renderItem={(task) => (
        <TaskRow
          task={task}
          done={isDone(task)}
          onToggle={() => onToggle(task.id)}
        />
      )}
    />
  )
}

export function TodayAgenda({
  overdue,
  groups,
  items,
  calendars,
  use24Hour,
}: {
  overdue: TaskWithSeries[]
  groups: AgendaGroup<TaskWithSeries>[]
  items: AgendaItem<TaskWithSeries, EventOccurrence>[]
  calendars: Calendar[]
  use24Hour: boolean
}) {
  const [toggledIds, addToggle] = React.useOptimistic<string[], string>(
    [],
    (state, id) => [...state, id],
  )
  const [, startTransition] = React.useTransition()

  /**
   * Locally reordered lists, keyed by routine id (or `LOOSE`), overlaid on the server's
   * order until the write lands and the page revalidates.
   *
   * An overlay rather than a copy of the whole list, for the reason `activity-view.tsx`
   * holds `goalOrder` the same way: a captured copy freezes at the moment it was taken, so
   * a task completed or created elsewhere would not appear until the component remounted.
   * Holding only the ORDER lets each render take the live rows and arrange them.
   */
  const [order, setOrder] = React.useState<Record<string, string[]>>({})

  /** The rows of one list, in the locally chosen order. Ids no longer present are
   *  dropped and rows the overlay has not seen fall to the end, so a completed or newly
   *  created task cannot vanish because an older ordering did not mention it. */
  function arrange(
    key: string,
    rows: TaskWithSeries[],
    from: Record<string, string[]> = order,
  ): TaskWithSeries[] {
    const ids = from[key]
    if (!ids) return rows
    const byId = new Map(rows.map((row) => [row.id, row]))
    const known = ids
      .map((id) => byId.get(id))
      .filter((row): row is TaskWithSeries => row !== undefined)
    const seen = new Set(ids)
    return [...known, ...rows.filter((row) => !seen.has(row.id))]
  }

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

  // Tasks all have `time: null`, so the merge in `buildTodayAgenda` can only ever place
  // them in one contiguous run: all-day events, then tasks, then timed events. Splitting
  // by kind here reproduces that order exactly, and is what lets the tasks — and only the
  // tasks — become a drag list. An event's position is its TIME; there is nothing to
  // reorder about it.
  // `flatMap` rather than `filter`, which does not narrow a discriminated union — these
  // have to come out as occurrences and tasks, not as agenda items.
  const allDay = items.flatMap((item) =>
    item.kind === "event" && !item.time ? [item.occurrence] : [],
  )
  const timed = items.flatMap((item) =>
    item.kind === "event" && item.time ? [item.occurrence] : [],
  )
  const loose = items.flatMap((item) =>
    item.kind === "task" ? [item.task] : [],
  )

  /**
   * Persist a drag.
   *
   * The whole of today's due tasks are sent, groups first and in the order shown, not just
   * the list that moved. `reorderTasks` writes `sortOrder = index` over exactly what it is
   * given, and that column is shared with /activity — sending one group alone would
   * renumber it 0..n and interleave it with every other task there.
   */
  function handleReorder(key: string, ids: string[]) {
    const next = { ...order, [key]: ids }
    setOrder(next)
    const flat = [
      ...groups.flatMap((group) => arrange(group.routineId, group.tasks, next)),
      ...arrange(LOOSE, loose, next),
    ].map((task) => task.id)

    startTransition(async () => {
      const result = await reorderTasks(flat)
      if (!result.ok) toast.error(result.error)
    })
  }

  if (overdue.length === 0 && groups.length === 0 && items.length === 0) {
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
        <h2 id="agenda-heading" className="mb-2 text-sm font-semibold">
          Agenda
        </h2>
        {groups.length === 0 && items.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm">
            <CalendarDays className="size-4 opacity-60" />
            Nothing scheduled or due today.
          </p>
        ) : (
          <div className="flex max-h-[34svh] flex-col gap-2 overflow-y-auto">
            {/* All-day events lead: they colour the whole day rather than sitting at a
                point in it, which is the same reason the time sort puts them first. */}
            {allDay.map((occurrence, i) => (
              <EventRow
                key={`allday-${i}`}
                occurrence={occurrence}
                calendars={calendars}
                use24Hour={use24Hour}
              />
            ))}

            {/* Then each routine, as its own block: a heading and a tint that say these
                rows arrived together and are meant to be run together — which a per-row
                badge repeated five times would not.

                Tinted rather than indented, and `-mx-2 px-2` rather than plain padding, so
                the block's background extends past the rows without moving them. `Gutter`
                exists to put every checkbox and every event time on one x-axis; an indent
                here would break that for grouped rows only, which reads as a misalignment
                rather than as hierarchy. */}
            {groups.map((group) => (
              <section
                key={group.routineId}
                aria-label={group.name}
                className="bg-muted/40 -mx-2 rounded-md px-2 py-1.5"
              >
                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                  <ListChecks className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{group.name}</span>
                  <span className="tabular-nums opacity-70">
                    {group.tasks.length}
                  </span>
                </div>
                <TaskList
                  rows={arrange(group.routineId, group.tasks)}
                  isDone={isDone}
                  onToggle={toggle}
                  onReorder={(ids) => handleReorder(group.routineId, ids)}
                />
              </section>
            ))}

            {/* Everything due today that no routine put there. Its own list, so dragging
                cannot move a task into or out of a routine — that would mean rewriting
                `routine_id`, which is a different thing to mean by a drag. */}
            {loose.length > 0 && (
              <TaskList
                rows={arrange(LOOSE, loose)}
                isDone={isDone}
                onToggle={toggle}
                onReorder={(ids) => handleReorder(LOOSE, ids)}
              />
            )}

            {timed.map((occurrence, i) => (
              <EventRow
                key={`timed-${i}`}
                occurrence={occurrence}
                calendars={calendars}
                use24Hour={use24Hour}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
