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

import { AgendaView } from "./agenda-view"
import { CalendarManager } from "./calendar-manager"
import { EventDialog, type EditScope } from "./event-dialog"
import { MonthGrid } from "./month-grid"

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(year, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number)
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

type CalendarView = "month" | "agenda"

export function CalendarView({
  month,
  today,
  timeZone,
  grid,
  byDay,
  occurrences,
  calendars,
}: {
  month: string
  today: string
  timeZone: string
  grid: string[][]
  byDay: Record<string, EventOccurrence[]>
  occurrences: EventOccurrence[]
  calendars: Calendar[]
}) {
  const [view, setView] = React.useState<CalendarView>("month")
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

  const currentMonth = today.slice(0, 7)

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
            {(["month", "agenda"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors",
                  view === v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v}
              </button>
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
          href={`/calendar?month=${shiftMonth(month, -1)}`}
          aria-label="Previous month"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ChevronLeft className="size-4" />
        </Link>
        <span className="min-w-40 text-center text-sm font-medium">
          {formatMonth(month)}
        </span>
        <Link
          href={`/calendar?month=${shiftMonth(month, 1)}`}
          aria-label="Next month"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ChevronRight className="size-4" />
        </Link>
        {month !== currentMonth && (
          <Link
            href="/calendar"
            className={cn(buttonVariants({ variant: "link", size: "sm" }))}
          >
            This month
          </Link>
        )}
      </div>

      {view === "month" ? (
        <MonthGrid
          grid={grid}
          byDay={shownByDay}
          month={month}
          today={today}
          calendars={calendars}
          onSelectDay={openCreate}
          onEditEvent={openEdit}
        />
      ) : (
        <AgendaView
          occurrences={shownOccurrences}
          month={month}
          today={today}
          calendars={calendars}
          onEditEvent={openEdit}
          onDelete={handleDeleteSeries}
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
