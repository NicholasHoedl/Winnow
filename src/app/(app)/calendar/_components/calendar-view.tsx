"use client"

import * as React from "react"
import Link from "next/link"
import { LinkPending } from "@/components/shared/link-pending"
import { CalendarPlus, ChevronLeft, ChevronRight, Layers } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { accentForSlot } from "@/lib/colors"
import {
  clearEventException,
  deleteEvent,
  deleteSeriesFrom,
  rescheduleOccurrence,
  restoreEvent,
  setSeriesEnd,
  skipOccurrence,
} from "@/modules/calendar/actions"
import type {
  Calendar,
  EventOccurrence,
  EventRow,
} from "@/modules/calendar/queries"
import { Button, buttonVariants } from "@/components/ui/button"

import { addDays } from "@/lib/date"
import { occurrenceKey } from "@/modules/calendar/service"
import { movedSpan } from "@/components/calendar/grid-geometry"
import { TimeGrid, type Reschedule } from "@/components/calendar/time-grid"
import { useWriteGuard } from "@/components/shared/use-write-guard"
import {
  useDateLocale,
  usePreferences,
} from "@/components/preferences/preferences-provider"

import { AgendaView } from "./agenda-view"
import { CalendarManager } from "./calendar-manager"
import { EventDialog, type EditScope } from "./event-dialog"
import { MonthGrid } from "./month-grid"
import {
  CALENDAR_VIEWS,
  calendarHref,
  isCurrentPeriod,
  shiftForView,
  viewTitle,
  type CalendarViewKind,
} from "./views"

/** What the prev/next arrows step by, for their labels. Agenda is a month of events,
 *  so it steps like the month view. */
const STEP_LABEL: Record<CalendarViewKind, string> = {
  month: "month",
  week: "week",
  day: "day",
  agenda: "month",
}

export function CalendarView({
  view,
  date,
  today,
  timeZone,
  grid,
  dates,
  byDay,
  occurrences,
  calendars,
}: {
  view: CalendarViewKind
  /** The anchor date the view is showing — a day, a day within the week, or a day
   *  within the month. Always in the URL, so every view is linkable. */
  date: string
  today: string
  timeZone: string
  /** Month grid weeks; empty for the week and day views. */
  grid: string[][]
  /** Time-grid columns; empty for the month and agenda views. */
  dates: string[]
  byDay: Record<string, EventOccurrence[]>
  occurrences: EventOccurrence[]
  calendars: Calendar[]
}) {
  const { weekStartsOn } = usePreferences()
  const locale = useDateLocale()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingOccurrence, setEditingOccurrence] =
    React.useState<EventOccurrence | null>(null)
  const [defaultDate, setDefaultDate] = React.useState(today)
  const [managerOpen, setManagerOpen] = React.useState(false)
  // Per-session calendar visibility (empty = show all; resets on reload).
  const [hiddenIds, setHiddenIds] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )
  // `isPending` is wanted now, for drag-to-reschedule: it is true exactly while an
  // optimistic write is open, which is the window a hard navigation would throw away.
  const [writing, startTransition] = React.useTransition()
  useWriteGuard(writing)

  const isVisible = (occ: EventOccurrence) =>
    !occ.event.calendarId || !hiddenIds.has(occ.event.calendarId)
  const shownOccurrences = occurrences.filter(isVisible)
  const shownByDay = Object.fromEntries(
    Object.entries(byDay).map(([d, list]) => [d, list.filter(isVisible)]),
  )

  function toggleCalendar(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openCreate(date: string = today) {
    setEditingOccurrence(null)
    setDefaultDate(date)
    setDialogOpen(true)
  }

  function openEdit(occ: EventOccurrence) {
    setEditingOccurrence(occ)
    setDialogOpen(true)
  }

  // Delete the whole series (agenda dropdown, or the dialog's "All events" scope).
  function handleDeleteSeries(event: EventRow) {
    startTransition(async () => {
      const result = await deleteEvent(event.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.event ?? event
      toast("Event removed", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await restoreEvent(restorable)
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  // Skip a single occurrence (the dialog's "This event" delete). Undo clears the row.
  // Keyed on originalDate, not on where the block sits: an occurrence that has been
  // dragged elsewhere still has its exception filed under the day the series would
  // have produced it, and skipping by the visible date would miss it entirely.
  function handleSkipOccurrence(occ: EventOccurrence) {
    startTransition(async () => {
      const result = await skipOccurrence(occ.seriesEvent.id, occ.originalDate)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast("Event skipped", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await clearEventException(
                occ.seriesEvent.id,
                occ.originalDate,
              )
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  /**
   * Stop the series from this occurrence onward.
   *
   * Undo has two shapes because the delete does: cutting at the FIRST occurrence leaves
   * nothing behind, so the row goes and `restoreEvent` brings it back — anywhere else
   * the series is merely truncated, and putting its old end date back is enough.
   */
  function handleDeleteFollowing(occ: EventOccurrence) {
    startTransition(async () => {
      const result = await deleteSeriesFrom(
        occ.seriesEvent.id,
        occ.originalDate,
      )
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const undo =
        result.kind === "deleted"
          ? () => restoreEvent(result.event)
          : () => setSeriesEnd(occ.seriesEvent.id, result.previousEndDate)
      toast("Removed from here on", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await undo()
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  function handleDialogDelete(occ: EventOccurrence, scope: EditScope) {
    if (scope === "this") handleSkipOccurrence(occ)
    else if (scope === "following") handleDeleteFollowing(occ)
    else handleDeleteSeries(occ.seriesEvent)
  }

  // The dropped position, held locally until the server round-trip lands. Without it
  // the block springs back to where it was for the length of the transition, which
  // reads as the drag having failed. Same trade as the to-do list's pendingOrder.
  const [pendingMove, setPendingMove] = React.useState<{
    key: string
    date: string
    time: string
  } | null>(null)

  function handleReschedule(occ: EventOccurrence, to: Reschedule) {
    const span = movedSpan(occ, to.date, to.time)
    setPendingMove({ key: occurrenceKey(occ), date: to.date, time: to.time })
    startTransition(async () => {
      const result = await rescheduleOccurrence(occ.seriesEvent.id, {
        // The date the SERIES would produce this on — the key the override is stored
        // under, not where the block currently sits. Sending occ.date would write a
        // second override the moment anything is dragged twice.
        originalDate: occ.originalDate,
        date: span.date,
        endDate: span.endDate,
        allDay: false,
        startTime: span.time,
        endTime: span.endTime ?? undefined,
      })
      if (!result.ok) toast.error(result.error)
      setPendingMove(null)
    })
  }

  /** Show a just-dropped block at its new day and time while the write is in flight. */
  function applyPendingMove(
    buckets: Record<string, EventOccurrence[]>,
  ): Record<string, EventOccurrence[]> {
    if (!pendingMove) return buckets
    const { key, date, time } = pendingMove
    let moved: EventOccurrence | undefined
    const out: Record<string, EventOccurrence[]> = {}
    for (const [day, list] of Object.entries(buckets)) {
      out[day] = list.filter((occ) => {
        if (occurrenceKey(occ) !== key) return true
        moved = occ
        return false
      })
    }
    if (!moved) return buckets
    const span = movedSpan(moved, date, time)
    const landed = { ...moved, ...span }
    // Re-bucket across every day the moved span now covers, the way bucketByDay would.
    for (let d = span.date; d <= span.endDate; d = addDays(d, 1)) {
      ;(out[d] ??= []).push(landed)
    }
    return out
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Calendar
          </h1>
        </div>
        {/* `flex-wrap` here, not only on the header. The header already wrapped, but this
            row was a single unbreakable flex child of it — four view links plus two
            buttons, ~416px intrinsic — so at 393px it overflowed and took the whole
            document sideways with it. Wrapping one level too high looks identical in the
            markup and is not the same thing. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-muted inline-flex rounded-lg p-0.5">
            {CALENDAR_VIEWS.map((v) => (
              <Link
                key={v}
                href={calendarHref(v, date)}
                aria-current={view === v ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors",
                  view === v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v}
              </Link>
            ))}
          </div>
          {/* A word rather than a menu: this page has exactly ONE secondary action, and a
              dropdown wrapping a single item is more chrome than the icon it replaced. The
              `aria-label` stays and still wins as the accessible name, so the visible text
              can be the short form. */}
          <Button
            variant="outline"
            size="sm"
            aria-label="Manage calendars"
            onClick={() => setManagerOpen(true)}
          >
            <Layers className="size-4" />
            Calendars
          </Button>
          <Button onClick={() => openCreate()}>
            <CalendarPlus className="size-4" />
            Add event
          </Button>
        </div>
      </header>

      {calendars.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          {calendars.map((cal) => {
            const hidden = hiddenIds.has(cal.id)
            return (
              <button
                key={cal.id}
                type="button"
                aria-pressed={!hidden}
                onClick={() => toggleCalendar(cal.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  hidden
                    ? "text-muted-foreground border-dashed opacity-60"
                    : "hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    hidden
                      ? "bg-muted-foreground/40"
                      : accentForSlot(cal.color).bar,
                  )}
                />
                {cal.name}
              </button>
            )
          })}
        </div>
      )}

      <div className="mb-4 flex items-center justify-center gap-1">
        <Link
          href={calendarHref(view, shiftForView(view, date, -1))}
          aria-label={`Previous ${STEP_LABEL[view]}`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          {/* Same-route param change: the segment is not remounted, so `loading.tsx`
              never fires and nothing else in the app indicates this. */}
          <LinkPending className="size-4">
            <ChevronLeft className="size-4" />
          </LinkPending>
        </Link>
        <span className="min-w-52 text-center text-sm font-medium">
          {viewTitle(view, date, weekStartsOn, locale)}
        </span>
        <Link
          href={calendarHref(view, shiftForView(view, date, 1))}
          aria-label={`Next ${STEP_LABEL[view]}`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <LinkPending className="size-4">
            <ChevronRight className="size-4" />
          </LinkPending>
        </Link>
        {!isCurrentPeriod(view, date, today, weekStartsOn) && (
          <Link
            href={calendarHref(view, today)}
            className={cn(buttonVariants({ variant: "link", size: "sm" }))}
          >
            {view === "day" ? "Today" : `This ${STEP_LABEL[view]}`}
          </Link>
        )}
      </div>

      {view === "month" ? (
        <MonthGrid
          grid={grid}
          byDay={shownByDay}
          month={date.slice(0, 7)}
          today={today}
          calendars={calendars}
          onSelectDay={openCreate}
          onEditEvent={openEdit}
        />
      ) : view === "agenda" ? (
        <AgendaView
          occurrences={shownOccurrences}
          month={date.slice(0, 7)}
          today={today}
          calendars={calendars}
          onEditEvent={openEdit}
          onDelete={handleDeleteSeries}
        />
      ) : (
        <TimeGrid
          dates={dates}
          byDay={applyPendingMove(shownByDay)}
          today={today}
          timeZone={timeZone}
          calendars={calendars}
          onSelectDay={openCreate}
          onEditEvent={openEdit}
          onReschedule={handleReschedule}
        />
      )}

      <EventDialog
        timeZone={timeZone}
        defaultDate={defaultDate}
        occurrence={editingOccurrence}
        calendars={calendars}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onDelete={handleDialogDelete}
      />
      <CalendarManager
        calendars={calendars}
        open={managerOpen}
        onOpenChange={setManagerOpen}
      />
    </div>
  )
}
