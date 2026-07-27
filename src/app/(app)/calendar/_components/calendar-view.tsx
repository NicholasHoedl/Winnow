"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarPlus, ChevronLeft, ChevronRight, Layers } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { accentForSlot } from "@/lib/colors"
import {
  clearEventException,
  deleteEvent,
  restoreEvent,
  skipOccurrence,
} from "@/modules/calendar/actions"
import type {
  Calendar,
  EventOccurrence,
  EventRow,
} from "@/modules/calendar/queries"
import { Button, buttonVariants } from "@/components/ui/button"

import { TimeGrid } from "@/components/calendar/time-grid"
import { usePreferences } from "@/components/preferences/preferences-provider"

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
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingOccurrence, setEditingOccurrence] =
    React.useState<EventOccurrence | null>(null)
  const [defaultDate, setDefaultDate] = React.useState(today)
  const [managerOpen, setManagerOpen] = React.useState(false)
  // Per-session calendar visibility (empty = show all; resets on reload).
  const [hiddenIds, setHiddenIds] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )
  const [, startTransition] = React.useTransition()

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
  function handleSkipOccurrence(occ: EventOccurrence) {
    startTransition(async () => {
      const result = await skipOccurrence(occ.seriesEvent.id, occ.date)
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
                occ.date,
              )
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  function handleDialogDelete(occ: EventOccurrence, scope: EditScope) {
    if (scope === "this") handleSkipOccurrence(occ)
    else handleDeleteSeries(occ.seriesEvent)
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Calendar
          </h1>
          <p className="text-muted-foreground text-sm">
            Your events.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            variant="outline"
            size="icon"
            aria-label="Manage calendars"
            onClick={() => setManagerOpen(true)}
          >
            <Layers className="size-4" />
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
                    hidden ? "bg-muted-foreground/40" : accentForSlot(cal.color).bar,
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
          <ChevronLeft className="size-4" />
        </Link>
        <span className="min-w-52 text-center text-sm font-medium">
          {viewTitle(view, date, weekStartsOn)}
        </span>
        <Link
          href={calendarHref(view, shiftForView(view, date, 1))}
          aria-label={`Next ${STEP_LABEL[view]}`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ChevronRight className="size-4" />
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
          byDay={shownByDay}
          today={today}
          timeZone={timeZone}
          calendars={calendars}
          onSelectDay={openCreate}
          onEditEvent={openEdit}
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
