"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { deleteEvent, restoreEvent } from "@/modules/calendar/actions"
import type {
  EventOccurrence,
  EventRow,
  GoalWithProgress,
} from "@/modules/calendar/queries"
import { Button, buttonVariants } from "@/components/ui/button"

import { AgendaView } from "./agenda-view"
import { EventDialog } from "./event-dialog"
import { GoalsPanel } from "./goals-panel"
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
  goals,
}: {
  month: string
  today: string
  timeZone: string
  grid: string[][]
  byDay: Record<string, EventOccurrence[]>
  occurrences: EventOccurrence[]
  goals: GoalWithProgress[]
}) {
  const [view, setView] = React.useState<CalendarView>("month")
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingEvent, setEditingEvent] = React.useState<EventRow | null>(null)
  const [defaultDate, setDefaultDate] = React.useState(today)
  const [, startTransition] = React.useTransition()

  const currentMonth = today.slice(0, 7)

  function openCreate(date: string = today) {
    setEditingEvent(null)
    setDefaultDate(date)
    setDialogOpen(true)
  }

  function openEdit(event: EventRow) {
    setEditingEvent(event)
    setDialogOpen(true)
  }

  function handleDelete(event: EventRow) {
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

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Calendar
          </h1>
          <p className="text-muted-foreground text-sm">
            Your events and long-term goals.
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
          <Button onClick={() => openCreate()}>
            <CalendarPlus className="size-4" />
            Add event
          </Button>
        </div>
      </header>

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
          byDay={byDay}
          month={month}
          today={today}
          onSelectDay={openCreate}
          onEditEvent={openEdit}
        />
      ) : (
        <AgendaView
          occurrences={occurrences}
          month={month}
          today={today}
          onEditEvent={openEdit}
          onDelete={handleDelete}
        />
      )}

      <GoalsPanel goals={goals} />

      <EventDialog
        timeZone={timeZone}
        defaultDate={defaultDate}
        event={editingEvent}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onDelete={handleDelete}
      />
    </div>
  )
}
