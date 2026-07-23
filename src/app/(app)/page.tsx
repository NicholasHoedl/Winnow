import Link from "next/link"
import { CalendarPlus, Plus } from "lucide-react"

import { auth } from "@/lib/auth"
import { getBudgetSummary, getCategories } from "@/modules/budget/queries"
import {
  getDayEvents,
  getGoals,
  getMonthEvents,
} from "@/modules/calendar/queries"
import { localDateTime } from "@/modules/calendar/service"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getMacroSummary } from "@/modules/meals/queries"
import { getTaskSummary } from "@/modules/todos/queries"
import { todayInZone } from "@/modules/todos/service"
import { Reveal } from "@/components/shared/reveal"
import { buttonVariants } from "@/components/ui/button"

import { CategoryBars } from "./_components/category-bars"
import { DashboardCalendar } from "./_components/dashboard-calendar"
import { GoalsSummary } from "./_components/goals-summary"
import { StatCards } from "./_components/stat-cards"
import { TodayTimeline } from "./_components/today-timeline"
import { UpNext } from "./_components/up-next"

function formatToday(today: string): string {
  const [y, m, d] = today.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

export default async function DashboardPage() {
  const { timeZone, weekStartsOn, currency, use24HourTime } =
    await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const month = today.slice(0, 7)
  const nowTime = localDateTime(new Date(), timeZone).time

  const [session, tasks, macros, budget, categories, dayEvents, monthData, goals] =
    await Promise.all([
      auth(),
      getTaskSummary(timeZone),
      getMacroSummary(today),
      getBudgetSummary(month),
      getCategories(),
      getDayEvents(today, timeZone),
      getMonthEvents(month, timeZone, weekStartsOn),
      getGoals(),
    ])

  const name = session?.user?.name ?? "there"
  const nextEvent =
    dayEvents.find((o) => o.time === null || o.time >= nowTime) ??
    monthData.occurrences.find((o) => o.date > today) ??
    null

  return (
    <div className="relative mx-auto w-full max-w-7xl p-6 lg:p-8">
      <div
        aria-hidden
        className="from-primary/[0.06] pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b to-transparent"
      />

      <Reveal>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-brand-accent font-mono text-xs tracking-widest uppercase">
              {formatToday(today)}
            </p>
            <h1 className="font-display mt-1 text-4xl font-semibold tracking-tight">
              Good to see you, {name}
            </h1>
            <p className="text-muted-foreground text-sm">
              Here&apos;s your day at a glance.
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
            <Link href="/todos" className={buttonVariants({ size: "sm" })}>
              <Plus className="size-4" />
              New task
            </Link>
          </div>
        </header>
      </Reveal>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-6">
          <Reveal delay={0.05}>
            <DashboardCalendar
              month={month}
              today={today}
              grid={monthData.grid}
              byDay={monthData.byDay}
            />
          </Reveal>
          <Reveal delay={0.1}>
            <StatCards
              tasks={tasks}
              macros={macros}
              budget={budget}
              currency={currency}
            />
          </Reveal>
          <Reveal delay={0.15}>
            <TodayTimeline events={dayEvents} use24Hour={use24HourTime} />
          </Reveal>
        </div>

        {/* Rail */}
        <div className="flex min-w-0 flex-col gap-6">
          <Reveal delay={0.1}>
            <UpNext
              nextEvent={nextEvent}
              tasks={tasks}
              today={today}
              use24Hour={use24HourTime}
            />
          </Reveal>
          <Reveal delay={0.15}>
            <CategoryBars
              budget={budget}
              categories={categories}
              currency={currency}
            />
          </Reveal>
          <Reveal delay={0.2}>
            <GoalsSummary goals={goals} />
          </Reveal>
        </div>
      </div>
    </div>
  )
}
