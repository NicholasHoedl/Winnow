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
import { getJournalEntry } from "@/modules/notes/queries"
import { addDays, todayInZone } from "@/lib/date"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getMacroSummary } from "@/modules/meals/queries"
import { getTasks } from "@/modules/todos/queries"
import { formatLongDate } from "@/lib/format"
import { Reveal } from "@/components/shared/reveal"
import { buttonVariants } from "@/components/ui/button"

import { CategoryBars } from "./_components/category-bars"
import {
  DashboardCalendar,
  type DashboardCalendarView,
} from "./_components/dashboard-calendar"
import { DashboardTaskList } from "./_components/dashboard-task-list"
import { GoalsSummary } from "./_components/goals-summary"
import { JournalCard } from "./_components/journal-card"
import { StatCards } from "./_components/stat-cards"
import { TodayAgenda } from "./_components/today-agenda"
import { Tomorrow } from "./_components/tomorrow"
import { NewTaskButton, QuickCapture } from "./_components/quick-capture"
import { buildTodayAgenda } from "./_lib/agenda"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>
}) {
  // `?calendar=week` swaps the dashboard's month grid for a week strip. In the URL rather
  // than in client state so the server renders the right one — no flash of the wrong view,
  // and no localStorage read during render. Anything unrecognised falls back to the month.
  const calendarView: DashboardCalendarView =
    (await searchParams).calendar === "week" ? "week" : "month"
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
    journalEntry,
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
    getJournalEntry(today),
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
    // Wide, not centred-in-a-gutter. `max-w-7xl` (1280px) left ~270px dead on each side
    // of a 1920 screen once the sidebar is accounted for; this fills a desktop and only
    // starts centring on displays wider than most people have.
    <div className="relative mx-auto w-full max-w-[120rem] p-4 lg:p-5 [@media(max-height:820px)]:py-3">
      <div
        aria-hidden
        className="from-primary/[0.06] pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b to-transparent"
      />

      <Reveal>
        <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-brand-accent font-mono text-xs tracking-widest uppercase">
              {formatLongDate(today)}
            </p>
            <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight xl:text-4xl">
              Good to see you, {name}
            </h1>
            <p className="text-muted-foreground text-sm [@media(max-height:820px)]:hidden">
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
        <div className="mb-4">
          <QuickCapture />
        </div>
      </Reveal>

      {/*
        Three columns of roughly equal height rather than one tall centre column.
        The agenda used to run full width above this grid, which read well but spent a
        1600px row on four short lines and pushed everything else below the fold. It is
        the first column instead — still the first thing read, at a width its content
        actually wants — and the month grid no longer sets the height of the page on its
        own. Each column's own components cap and scroll internally (see TodayAgenda and
        DashboardTaskList), so no amount of data turns this back into a scrolling page.
      */}
      <div className="grid grid-cols-1 gap-5 lg:min-h-[calc(100svh-12.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* Today: what needs you, then the backlog it doesn't cover */}
        <div className="flex min-w-0 flex-col gap-5">
          <Reveal delay={0.05}>
            <TodayAgenda
              overdue={overdue}
              items={items}
              calendars={calendars}
              use24Hour={use24HourTime}
            />
          </Reveal>
          <Reveal delay={0.08}>
            <DashboardTaskList tasks={upcomingTasks} timeZone={timeZone} />
          </Reveal>
          {/* In this column rather than the right one for two reasons: the journal is a
              today thing, like everything else here — and the right rail already runs
              five cards deep, where a sixth pushed past the fold and undid the "each
              column caps itself, the page doesn't scroll" property below. */}
          <Reveal delay={0.11}>
            <JournalCard entry={journalEntry} />
          </Reveal>
        </div>

        {/* The month */}
        <div className="flex min-w-0 flex-col gap-5">
          <Reveal delay={0.1} className="flex min-h-0 flex-1 flex-col">
            <DashboardCalendar
              month={month}
              today={today}
              grid={monthData.grid}
              byDay={monthData.byDay}
              calendars={calendars}
              view={calendarView}
            />
          </Reveal>
        </div>

        {/* What's next, today's numbers, and the two trackers */}
        <div className="flex min-w-0 flex-col gap-5">
          <Reveal delay={0.12}>
            <Tomorrow
              date={nextDate}
              events={nextDayEvents}
              calendars={calendars}
              use24Hour={use24HourTime}
            />
          </Reveal>
          <Reveal delay={0.15}>
            <StatCards macros={macros} budget={budget} currency={currency} />
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
