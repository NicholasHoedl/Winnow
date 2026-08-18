import Link from "next/link"
import { CalendarPlus, ClipboardList } from "lucide-react"

import { auth } from "@/lib/auth"
import { getBudgetSummary, getCategories } from "@/modules/budget/queries"
import {
  getCalendars,
  getMonthEvents,
  getRangeEvents,
} from "@/modules/calendar/queries"
import { getGoals } from "@/modules/goals/queries"
import { getHabitStrip } from "@/modules/habits/queries"
import { getRoutineNames } from "@/modules/routines/queries"
import { addDays, todayInZone } from "@/lib/date"
import { getUserPreferences } from "@/modules/preferences/queries"
import { getMacroSummary } from "@/modules/meals/queries"
import { getTasks } from "@/modules/todos/queries"
import { formatLongDate } from "@/lib/format"
import { dateLocale } from "@/lib/preferences"
import type { DashboardCard } from "@/lib/preferences"
import { Reveal } from "@/components/shared/reveal"
import { buttonVariants } from "@/components/ui/button"

import { CategoryBars } from "./_components/category-bars"
import {
  DashboardCalendar,
  type DashboardCalendarView,
} from "./_components/dashboard-calendar"

import { GoalsPracticeCard } from "./_components/goals-practice-card"
import { StatCards } from "./_components/stat-cards"
import { Slate } from "./_components/slate"
import { NewTaskButton, QuickCapture } from "./_components/quick-capture"
import { buildSlate } from "./_lib/agenda"
import { FirstRun } from "./_components/first-run"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>
}) {
  const {
    timeZone,
    weekStartsOn,
    currency,
    use24HourTime,
    goalMomentumDays,
    slateHorizonDays,
    dashboardCollapsed,
    dashboardCalendarView,
    dateFormat,
  } = await getUserPreferences()
  // `?calendar=week` swaps the dashboard's month grid for a week strip. In the URL rather
  // than in client state so the server renders the right one — no flash of the wrong view,
  // and no localStorage read during render.
  //
  // An explicit `?calendar=` still wins; without one this falls back to the saved preference
  // rather than always to month. Same precedence `/calendar` uses for `defaultCalendarView`
  // (T14), and the same trap that fixed: while month was hard-coded as the fallback, a Week
  // button that omitted the parameter produced a URL resolving straight back to month.
  const requested = (await searchParams).calendar
  const calendarView: DashboardCalendarView =
    requested === "week" || requested === "month"
      ? requested
      : dashboardCalendarView
  const today = todayInZone(new Date(), timeZone)
  const month = today.slice(0, 7)

  const [
    session,
    tasks,
    macros,
    budget,
    categories,
    slateEvents,
    monthData,
    goals,
    calendars,
    habits,
    routineNames,
  ] = await Promise.all([
    auth(),
    getTasks(),
    getMacroSummary(today),
    getBudgetSummary(month),
    getCategories(),
    // ONE ranged read where there were two single-day ones. Slate spans today through the
    // horizon, and `getDayEvents` is only a thin wrapper over this — asking for a range is
    // both fewer round trips and the shape the card actually wants. Half-open, so `+ 1`
    // reaches the horizon day itself.
    getRangeEvents(today, addDays(today, slateHorizonDays + 1), timeZone),
    // Still fetched even though the calendar it feeds is `lg:` only. There is one server
    // render and it has no idea how wide the viewport is, so this cannot be skipped for
    // phones — and it sits inside this `Promise.all`, so it costs no serial latency. Not
    // dead weight to be cleaned up.
    getMonthEvents(month, timeZone, weekStartsOn),
    getGoals(timeZone, goalMomentumDays),
    getCalendars(),
    // The cheap read, same as /activity — two bounded queries for a card that shows
    // done/target and nothing else.
    getHabitStrip(),
    // Ids to names, so Slate can head each routine's block. Not `getRoutines()`:
    // that would fetch every routine's full item list to read one string per row.
    getRoutineNames(),
  ])

  const name = session?.user?.name ?? "there"

  // Narrowed before it crosses into a client component. `GoalsPracticeCard` has to be a
  // client component — a habit is loggable from it — so whatever it receives is serialised
  // into the RSC payload, and `GoalWithProgress` carries every milestone and linked task the
  // card never draws. Four fields go instead, which is the same call `HabitStripCard`
  // already makes for habits.
  // A membership test per card rather than six booleans threaded through. `dashboardCollapsed`
  // is already filtered to keys this build knows about (`parseCollapsedCards`), so a key left
  // behind by a deleted card cannot fold anything by accident.
  const folded = (card: DashboardCard) => dashboardCollapsed.includes(card)

  /**
   * Has this account got anything at all?
   *
   * Every source the dashboard draws from, because "empty" has to mean empty — a user who
   * has only logged meals should not be told to start. `budget.totalBudgetedCents` is in
   * there as well as the spend, since setting a budget and spending nothing is a real state.
   *
   * Cheap: all of these are already awaited above for the cards, so this adds no query.
   */
  const isFirstRun =
    tasks.length === 0 &&
    goals.length === 0 &&
    habits.length === 0 &&
    slateEvents.length === 0 &&
    // `.occurrences`, not `.byDay` — that one is a Record, so `.size` is undefined and
    // the check would have been silently true forever. Two windows (the Slate horizon and
    // the visible month); an account holding only a far-future event sees this card once.
    monthData.occurrences.length === 0 &&
    budget.expenseCents === 0 &&
    budget.incomeCents === 0 &&
    budget.totalBudgetedCents === 0 &&
    macros.progress.calories.consumed === 0

  const goalRows = goals.map((goal) => ({
    id: goal.id,
    title: goal.title,
    progress: goal.progress,
    stalled: goal.momentum?.stalled ?? false,
  }))

  // Everything with a date on it, in one pass: overdue, then a band per day out to the
  // horizon, then whatever is further off than that.
  //
  // The whole task list goes in, not a pre-filtered slice. Three cards used to split it
  // between them and the split leaked — the "not in the agenda" set here read `overdue` and
  // `items` but never `groups`, so a task a routine created for today was drawn in its
  // routine block AND again under "Coming up". One function assigning every task to exactly
  // one band is why that class of bug is now unreachable rather than merely fixed.
  const { overdue, bands } = buildSlate(
    tasks,
    slateEvents,
    new Date(),
    timeZone,
    slateHorizonDays,
    routineNames,
    dateLocale(dateFormat),
  )

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
              {formatLongDate(today, dateLocale(dateFormat))}
            </p>
            {/* No tagline under this any more.

                "Here's your day at a glance" described the page to someone seeing it for the
                first time, on the surface its owner opens several times a day, forever. The
                same pass removed the equivalent line from Activity, Calendar, Budget, Meals
                and Settings, and kept the ones that say something the heading does not —
                Goals naming momentum, Routines defining what a routine is, Appearance
                explaining that the setting follows the account. The test is whether a reader
                who already knows what the page is would lose anything. */}
            <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight xl:text-4xl">
              Good to see you, {name}
            </h1>
          </div>
          {/* `flex-wrap` is load-bearing, not tidying. The header above wraps, but this
              inner row did not, so a fourth button ran to 440px on a 375px phone and made
              the whole PAGE scroll sideways — which T10a introduced by adding Companion
              here and did not catch, because only /activity was checked at that width. */}
          <div className="flex flex-wrap gap-2">
            {/* The Companion button was here until T13 deleted the page it went to. Every
                one of its four jobs now lives on the page of the thing it produces, so
                there is nowhere central left to link to — and nothing here is conditional
                on the AI settings any more.

                `/review` kept its button even though it gained a nav tab in T13, as a
                second door from the surface you land on. */}
            <Link
              href="/review"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ClipboardList className="size-4" />
              Review
            </Link>
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

      {/* Below the quick-add, not above it: the fastest way to stop this card being true is
          the box directly above, and putting guidance in front of the control it describes
          would push that control down the page on the one visit it matters most. */}
      {isFirstRun && (
        <Reveal delay={0.06}>
          <FirstRun />
        </Reveal>
      )}

      {/*
        Three columns of roughly equal height rather than one tall centre column.
        The agenda used to run full width above this grid, which read well but spent a
        1600px row on four short lines and pushed everything else below the fold. It is
        the first column instead — still the first thing read, at a width its content
        actually wants — and the month grid no longer sets the height of the page on its
        own. Slate caps and scrolls internally, so no amount of data turns this back into a
        scrolling page.
      */}
      <div className="grid grid-cols-1 gap-5 lg:min-h-[calc(100svh-12.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* Everything dated, then what it is all in service of */}
        <div className="flex min-w-0 flex-col gap-5">
          <Reveal delay={0.05}>
            <Slate
              overdue={overdue}
              bands={bands}
              calendars={calendars}
              use24Hour={use24HourTime}
              collapsed={folded("slate")}
            />
          </Reveal>
          {/* Directly under the tasks, so *what I have to do*, *what I have to keep doing*
              and *what it is all for* read as one column — the same pairing /activity makes
              with the strip above its list. Not in the right column: that one already ran
              five cards deep before this merge, where a sixth pushed past the fold, and an
              uncapped card is taller still. Renders nothing when there are no goals and no
              habits. */}
          <Reveal delay={0.11}>
            <GoalsPracticeCard
              goals={goalRows}
              habits={habits}
              collapsed={folded("goals")}
            />
          </Reveal>
        </div>

        {/* The month — desktop only.
            `lg`, matching the grid above rather than the app's `md` nav breakpoint: below
            `lg` this grid is one column, so the calendar stops being a column and becomes a
            tall block wedged between the agenda and the stat cards, on the surface with the
            least vertical room. `hidden lg:flex` with the flex modifiers `lg:`-prefixed is
            the house pattern (see `activity/loading.tsx`).

            `loading.tsx` carries the same visibility on its middle column. If you change
            one, change both — a skeleton that reserves 384px the page then never fills is
            the jump that file exists to prevent. */}
        <div className="hidden min-w-0 lg:flex lg:flex-col lg:gap-5">
          <Reveal delay={0.1} className="flex min-h-0 flex-1 flex-col">
            <DashboardCalendar
              month={month}
              today={today}
              grid={monthData.grid}
              byDay={monthData.byDay}
              calendars={calendars}
              view={calendarView}
              collapsed={folded("calendar")}
            />
          </Reveal>
        </div>

        {/* Today's numbers. `Tomorrow` led this column until Slate absorbed it — which is
            also the last dashboard use of `Panel`, the branded gradient, leaving only the
            digest banner on it. Slate stays a plain `Card` deliberately: two competing
            "look here first" surfaces is no emphasis at all. */}
        <div className="flex min-w-0 flex-col gap-5">
          <Reveal delay={0.15}>
            <StatCards
              macros={macros}
              budget={budget}
              currency={currency}
              collapsed={{ macros: folded("macros"), budget: folded("budget") }}
            />
          </Reveal>
          <Reveal delay={0.2}>
            <CategoryBars
              budget={budget}
              categories={categories}
              currency={currency}
              collapsed={folded("categories")}
            />
          </Reveal>
        </div>
      </div>
    </div>
  )
}
