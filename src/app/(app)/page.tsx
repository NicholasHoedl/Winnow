import Link from "next/link"
import { CalendarPlus } from "lucide-react"

import { auth } from "@/lib/auth"
import { getBudgetSummary, getCategories } from "@/modules/budget/queries"
import {
  getCalendars,
  getDayEvents,
  getMonthEvents,
} from "@/modules/calendar/queries"
import { getGoals } from "@/modules/goals/queries"
import { addDays, todayInZone } from "@/lib/date"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getMacroSummary } from "@/modules/meals/queries"
import { getTasks } from "@/modules/todos/queries"
import { formatLongDate } from "@/lib/format"
import { Reveal } from "@/components/shared/reveal"
import { buttonVariants } from "@/components/ui/button"

import { CategoryBars } from "./_components/category-bars"
import { DashboardCalendar } from "./_components/dashboard-calendar"
import { DashboardTaskList } from "./_components/dashboard-task-list"
import { GoalsSummary } from "./_components/goals-summary"
import { StatCards } from "./_components/stat-cards"
import { TodayAgenda } from "./_components/today-agenda"
import { Tomorrow } from "./_components/tomorrow"
import { NewTaskButton, QuickCapture } from "./_components/quick-capture"
import { buildTodayAgenda } from "./_lib/agenda"

export default async function DashboardPage() {
  const { timeZone, weekStartsOn, currency, use24HourTime } =
    await getUserPreferences()
  const today = todayInZone(new Date(), timeZone)
  const month = today.slice(0, 7)
  const nextDate = addDays(today, 1)

  const [
    session,
    tasks,
    macros,
    budget,
    categories,
    dayEvents,
    nextDayEvents,
    monthData,
    goals,
    calendars,
  ] = await Promise.all([
    auth(),
    getTasks(),
    getMacroSummary(today),
    getBudgetSummary(month),
    getCategories(),
    getDayEvents(today, timeZone),
    getDayEvents(nextDate, timeZone),
    getMonthEvents(month, timeZone, weekStartsOn),
    getGoals(),
    getCalendars(),
  ])

  const name = session?.user?.name ?? "there"
  const openTasks = tasks.filter((task) => task.status === "open")

  // Overdue tasks, and today's events and due tasks merged into one time-ordered list.
  // This was a separate `/today` route until it was folded in here — the two pages ran
  // five of the same queries and differed only by this.
  const { overdue, items } = buildTodayAgenda(
    tasks,
    dayEvents,
    new Date(),
    timeZone,
  )

  // What the card beside the agenda shows: the open tasks the agenda does NOT.
  //
  // Derived from the agenda's own output rather than re-deriving "overdue" and "due
  // today" here — two independent definitions of the same boundary is how a task ends up
  // listed twice, or in neither place, the day one of them changes.
  const inAgenda = new Set<string>([
    ...overdue.map((task) => task.id),
    ...items.flatMap((item) => (item.kind === "task" ? [item.task.id] : [])),
  ])
  const upcomingTasks = openTasks.filter((task) => !inAgenda.has(task.id))

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
              {formatLongDate(today)}
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
            <NewTaskButton />
          </div>
        </header>
      </Reveal>

      <Reveal delay={0.03}>
        <div className="mb-6">
          <QuickCapture />
        </div>
      </Reveal>

      {/* Full width, above the grid: what actually needs you today leads the page,
          and everything below it is context. */}
      <Reveal delay={0.05}>
        <div className="mb-6">
          <TodayAgenda
            overdue={overdue}
            items={items}
            calendars={calendars}
            use24Hour={use24HourTime}
          />
        </div>
      </Reveal>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,2.5fr)_minmax(0,1fr)]">
        {/* Task backlog — what the agenda above doesn't already show */}
        <div className="flex min-w-0 flex-col gap-6">
          <Reveal delay={0.08}>
            <DashboardTaskList tasks={upcomingTasks} timeZone={timeZone} />
          </Reveal>
        </div>

        {/* Center column — calendar + stats */}
        <div className="flex min-w-0 flex-col gap-6">
          <Reveal delay={0.1}>
            <DashboardCalendar
              month={month}
              today={today}
              grid={monthData.grid}
              byDay={monthData.byDay}
              calendars={calendars}
            />
          </Reveal>
          <Reveal delay={0.15}>
            <StatCards macros={macros} budget={budget} currency={currency} />
          </Reveal>
        </div>

        {/* Rail */}
        <div className="flex min-w-0 flex-col gap-6">
          <Reveal delay={0.15}>
            <Tomorrow
              date={nextDate}
              events={nextDayEvents}
              calendars={calendars}
              use24Hour={use24HourTime}
            />
          </Reveal>
          <Reveal delay={0.2}>
            <CategoryBars
              budget={budget}
              categories={categories}
              currency={currency}
            />
          </Reveal>
          <Reveal delay={0.25}>
            <GoalsSummary goals={goals} />
          </Reveal>
        </div>
      </div>
    </div>
  )
}
