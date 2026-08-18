"use client"

// The dashboard's Slate: everything with a date on it, nearest first.
//
// Replaces `today-agenda`, `dashboard-task-list` ("Coming up") and `tomorrow`, which split one
// question — *what has a date?* — along an arbitrary line, and duplicated heavily doing it: the
// event row in two of them was character-identical apart from padding, and each had its own
// copy of the same date formatter. One row component each now, and one gutter.
//
// Tasks stay checkable here (optimistic); today's routine tasks stay draggable. Tapping
// anything else jumps to the module that owns it.

import * as React from "react"
import Link from "next/link"
import { ListChecks, Sparkles, Star } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { accentForCalendar } from "@/lib/colors"
import { formatTime } from "@/lib/format"
import type { Calendar, EventOccurrence } from "@/modules/calendar/queries"
import { occurrenceKey } from "@/modules/calendar/service"
import { reorderTasks, toggleTaskStatus } from "@/modules/todos/actions"
import type { TaskWithSeries } from "@/modules/todos/queries"
import { SortableList } from "@/components/shared/sortable-list"
import { Checkbox } from "@/components/ui/checkbox"

import { DashboardCard } from "./dashboard-card"

import type { AgendaGroup, SlateBand } from "../_lib/agenda"
import { useDateLocale } from "@/components/preferences/preferences-provider"

/** Key for the ungrouped tasks in the local order overlay. Not a valid uuid, so it can
 *  never collide with a routine id. */
const LOOSE = "loose"

/** How many rows the Later band shows before pointing at /activity. */
const LATER_SHOWN = 10

/** "12 Sep" — the one date formatter, where there used to be two byte-identical copies
 *  under two names in two files. */
function shortDate(date: string, locale: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

/** Fixed-width leading gutter so event times and task checkboxes share an axis and
 * every title starts at the same x. "Coming up" did not use this, so its titles never
 * lined up with the agenda's directly above it; one row component ends that. */
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
  showDate = false,
}: {
  task: TaskWithSeries
  done: boolean
  onToggle: () => void
  /** The Later band only, where a row's day is the whole reason it is down there. */
  showDate?: boolean
}) {
  const locale = useDateLocale()
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
      {showDate && task.dueDate && !done && (
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {shortDate(task.dueDate, locale)}
        </span>
      )}
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
      {/* An icon, not a colour: the accent border already means *which calendar*, so
          highlight has to be an orthogonal channel. Same treatment as the stalled goal
          marker, and for the same reason — the dashboard runs tight below 1400px. */}
      {occurrence.event.highlighted && (
        <>
          <Star className="text-brand-accent size-3 shrink-0" aria-hidden />
          <span className="sr-only">Highlighted</span>
        </>
      )}
    </Link>
  )
}

/**
 * One draggable run of task rows.
 *
 * At module level rather than inside `Slate`: a component declared during render is a new
 * type on every pass, so React remounts its whole subtree — and here that subtree owns a
 * DndContext mid-drag.
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

export function Slate({
  overdue,
  bands,
  calendars,
  use24Hour,
  collapsed,
}: {
  overdue: TaskWithSeries[]
  bands: SlateBand<TaskWithSeries, EventOccurrence>[]
  calendars: Calendar[]
  use24Hour: boolean
  collapsed: boolean
}) {
  const [, startTransition] = React.useTransition()
  // An append-only id array, not a copy of the rows. The card this replaces held a full
  // row-array copy, which freezes at the moment it is taken — a task completed elsewhere
  // would not appear until the component remounted.
  const [toggledIds, addToggle] = React.useOptimistic<string[], string>(
    [],
    (state, id) => [...state, id],
  )
  const [order, setOrder] = React.useState<Record<string, string[]>>({})

  /** The rows of one list, in the locally chosen order. Ids no longer present are dropped
   *  and rows the overlay has not seen fall to the end, so a completed or newly created
   *  task cannot vanish because an older ordering did not mention it. */
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

  const today = bands[0]
  const todayTasks = (today?.items ?? []).flatMap((item) =>
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
      ...(today?.groups ?? []).flatMap((group: AgendaGroup<TaskWithSeries>) =>
        arrange(group.routineId, group.tasks, next),
      ),
      ...arrange(LOOSE, todayTasks, next),
    ].map((task) => task.id)

    startTransition(async () => {
      const result = await reorderTasks(flat)
      if (!result.ok) toast.error(result.error)
    })
  }

  // Not `bands.length === 0`. `buildSlate` always emits the Today band — a clear day is
  // worth saying out loud, and an anchored "Today" is what stops the next heading down from
  // being read as today's. So emptiness is about CONTENT, and it has to count `groups` as
  // well as `items`: a day whose only tasks came from a routine has all of them in groups
  // and an empty `items`.
  const empty =
    overdue.length === 0 &&
    bands.every((band) => band.items.length === 0 && band.groups.length === 0)

  if (empty) {
    return (
      <DashboardCard card="slate" title="Slate" collapsed={collapsed}>
        <p className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
          <Sparkles className="size-6 opacity-60" />
          Nothing due and nothing scheduled. The day is yours.
        </p>
      </DashboardCard>
    )
  }

  return (
    <DashboardCard
      card="slate"
      title="Slate"
      collapsed={collapsed}
      actions={
        /* `All →`, never `Calendar →`. An earlier agenda header linked to /calendar for no
           reason a reader could infer, and `dashboard-agenda.spec.ts` asserts negatively
           that no such link comes back. */
        <Link
          href="/activity"
          className="text-muted-foreground hover:text-foreground text-xs font-normal underline-offset-4 hover:underline"
        >
          All →
        </Link>
      }
    >
      <div className="flex max-h-[52svh] flex-col gap-4 overflow-y-auto">
        {overdue.length > 0 && (
          <div className="border-destructive/30 bg-destructive/[0.04] rounded-lg border p-3">
            <div className="mb-1.5 flex items-baseline justify-between">
              <h3 className="text-destructive text-xs font-semibold tracking-wide uppercase">
                Overdue
              </h3>
              <span className="text-muted-foreground text-xs tabular-nums">
                {overdue.length}
              </span>
            </div>
            <ol className="flex flex-col gap-0.5">
              {overdue.map((task) => (
                <li key={task.id}>
                  <TaskRow
                    task={task}
                    done={isDone(task)}
                    onToggle={() => toggle(task.id)}
                    showDate
                  />
                </li>
              ))}
            </ol>
          </div>
        )}

        {bands.map((band, bandIndex) => {
          const isToday = bandIndex === 0 && band.date !== null
          const isLater = band.date === null
          // Today splits by kind so the tasks — and only the tasks — can be a drag list.
          // An event's position is its TIME; there is nothing to reorder about it.
          const events = band.items.flatMap((item) =>
            item.kind === "event" ? [item.occurrence] : [],
          )
          const allDay = events.filter((occ) => occ.time === null)
          const timed = events.filter((occ) => occ.time !== null)
          const tasks = band.items.flatMap((item) =>
            item.kind === "task" ? [item.task] : [],
          )
          const shown = isLater ? tasks.slice(0, LATER_SHOWN) : tasks

          return (
            <div key={band.date ?? "later"}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  {band.label}
                </h3>
                {isLater && tasks.length > LATER_SHOWN && (
                  <Link
                    href="/activity"
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    +{tasks.length - LATER_SHOWN} more
                  </Link>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                {/* All-day events lead: they colour the whole day rather than sitting at
                      a point in it, which is the same reason the time sort puts them
                      first. */}
                {allDay.map((occurrence) => (
                  <EventRow
                    key={occurrenceKey(occurrence)}
                    occurrence={occurrence}
                    calendars={calendars}
                    use24Hour={use24Hour}
                  />
                ))}

                {/* Each routine as its own block: a heading and a tint saying these rows
                      arrived together and are meant to be run together. Tinted rather than
                      indented — `Gutter` exists to put every checkbox on one x-axis, and an
                      indent here would break that for grouped rows only, which reads as a
                      misalignment rather than as hierarchy. Today only; every other band is
                      a preview with no ordering applied to it.

                      NO horizontal padding, and no negative margin to cancel one. The tint
                      wanted to bleed 8px past the rows via `-mx-2 px-2`, which is a
                      scrollbar rather than a flourish: this sits inside an `overflow-y-auto`
                      section, and `overflow-y: auto` computes `overflow-x` to `auto` too, so
                      anything wider than the box scrolls sideways. `mobile-layout.spec.ts`
                      cannot see it either — it skips every subtree under a computed
                      `overflow-x: auto` ancestor by design. Same bleed as the `-mx-1` that
                      reached `habit-strip` and `routines-line`. */}
                {isToday &&
                  band.groups.map((group) => (
                    <section
                      key={group.routineId}
                      aria-label={group.name}
                      className="bg-muted/40 rounded-md py-1.5"
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

                {isToday && shown.length > 0 ? (
                  /* Its own list, so dragging cannot move a task into or out of a
                       routine — that would mean rewriting `routine_id`, which is a
                       different thing to mean by a drag. */
                  <TaskList
                    rows={arrange(LOOSE, shown)}
                    isDone={isDone}
                    onToggle={toggle}
                    onReorder={(ids) => handleReorder(LOOSE, ids)}
                  />
                ) : (
                  shown.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      done={isDone(task)}
                      onToggle={() => toggle(task.id)}
                      showDate={isLater}
                    />
                  ))
                )}

                {timed.map((occurrence) => (
                  <EventRow
                    key={occurrenceKey(occurrence)}
                    occurrence={occurrence}
                    calendars={calendars}
                    use24Hour={use24Hour}
                  />
                ))}

                {/* Reachable for today alone, which is the one band emitted whether or
                      not it has anything in it. Said in words rather than left blank: a
                      heading with nothing under it looks like a rendering fault, and "you
                      have nothing on" is worth reading. */}
                {band.items.length === 0 && band.groups.length === 0 && (
                  <p className="text-muted-foreground py-1 pl-14 text-sm">
                    Nothing today.
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </DashboardCard>
  )
}
