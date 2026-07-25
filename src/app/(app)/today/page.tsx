// The Today hub: a focused, single-column counterpart to the dense dashboard —
// only what actually needs you today. Runs a subset of the dashboard's queries and
// merges tasks + events through the pure agenda builder.

import Link from "next/link"
import { CalendarPlus } from "lucide-react"

import { getBudgetSummary } from "@/modules/budget/queries"
import { getCalendars, getDayEvents } from "@/modules/calendar/queries"
import { getMacroSummary } from "@/modules/meals/queries"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getTasks } from "@/modules/todos/queries"
import { todayInZone } from "@/lib/date"
import { formatLongDate } from "@/lib/format"
import { Reveal } from "@/components/shared/reveal"
import { buttonVariants } from "@/components/ui/button"

import { NewTaskButton, QuickCapture } from "../_components/quick-capture"
import { StatCards } from "../_components/stat-cards"
import { TodayView } from "./_components/today-view"
import { buildTodayAgenda } from "./_lib/agenda"

export default async function TodayPage() {
  const { timeZone, currency, use24HourTime } = await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const month = today.slice(0, 7)

  const [tasks, dayEvents, calendars, macros, budget] = await Promise.all([
    getTasks(),
    getDayEvents(today, timeZone),
    getCalendars(),
    getMacroSummary(today),
    getBudgetSummary(month),
  ])

  const { overdue, items } = buildTodayAgenda(
    tasks,
    dayEvents,
    new Date(),
    timeZone,
  )

  return (
    <div className="relative mx-auto w-full max-w-3xl p-6 lg:p-8">
      <div
        aria-hidden
        className="from-primary/[0.06] pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b to-transparent"
      />

      <Reveal>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-brand-accent font-mono text-xs tracking-widest uppercase">
              {formatLongDate(today)}
            </p>
            <h1 className="font-display mt-1 text-4xl font-semibold tracking-tight">
              Today
            </h1>
            <p className="text-muted-foreground text-sm">
              Everything that needs you today, in one place.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/calendar"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <CalendarPlus className="size-4" />
              Add event
            </Link>
            <NewTaskButton />
          </div>
        </header>
      </Reveal>

      <Reveal delay={0.03}>
        <div className="mb-6">
          <QuickCapture />
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <TodayView
          overdue={overdue}
          items={items}
          calendars={calendars}
          use24Hour={use24HourTime}
        />
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-6">
          <StatCards macros={macros} budget={budget} currency={currency} />
        </div>
      </Reveal>
    </div>
  )
}
