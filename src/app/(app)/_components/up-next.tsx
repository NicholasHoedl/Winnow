import Link from "next/link"
import { ArrowRight, ListTodo, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import { accentForCalendar } from "@/lib/colors"
import { formatTime } from "@/lib/format"
import type { Calendar, EventOccurrence } from "@/modules/calendar/queries"

type TasksLite = { overdueCount: number; dueTodayCount: number }

function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

// A branded panel wrapper — the rail's visual anchor, kept from the old hero.
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="from-primary/10 relative overflow-hidden rounded-xl bg-gradient-to-br to-transparent p-5 shadow-sm ring-1 ring-foreground/10">
      {children}
    </div>
  )
}

function Hero({
  href,
  icon,
  title,
  subtitle,
  cta,
}: {
  href: string
  icon: React.ReactNode
  title: string
  subtitle: string
  cta: string
}) {
  return (
    <Link href={href} className="group block">
      <Panel>
        <div className="flex items-start gap-4">
          <span className="bg-brand-accent/15 text-brand-accent flex size-11 shrink-0 items-center justify-center rounded-xl">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-brand-accent font-mono text-[0.7rem] font-medium tracking-widest uppercase">
              Up next
            </p>
            <h2 className="font-display mt-0.5 truncate text-2xl font-semibold tracking-tight">
              {title}
            </h2>
            <p className="text-muted-foreground mt-1 truncate text-sm">
              {subtitle}
            </p>
          </div>
          <span className="text-muted-foreground group-hover:text-foreground mt-1 flex shrink-0 items-center gap-1 text-xs font-medium transition-colors">
            {cta}
            <ArrowRight className="size-4" />
          </span>
        </div>
      </Panel>
    </Link>
  )
}

function DayGroup({
  label,
  date,
  events,
  calendars,
  use24Hour,
}: {
  label: string
  date: string
  events: EventOccurrence[]
  calendars: Calendar[]
  use24Hour: boolean
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">
          {label}{" "}
          <span className="text-muted-foreground font-normal">
            {shortDate(date)}
          </span>
        </h3>
        <span className="text-muted-foreground text-xs tabular-nums">
          {events.length > 0
            ? `${events.length} ${events.length === 1 ? "event" : "events"}`
            : "Clear"}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="text-muted-foreground/70 py-1 text-sm">Nothing scheduled</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {events.map((occ, i) => {
            const accent = accentForCalendar(
              occ.event.calendarId,
              calendars,
              occ.event.id,
            )
            return (
              <li key={`${occ.event.id}-${i}`}>
                <Link
                  href="/calendar"
                  className={cn(
                    "hover:bg-accent flex items-center gap-2.5 rounded-md border-l-2 py-1 pr-2 pl-2.5 transition-colors",
                    accent.tint,
                    accent.border,
                  )}
                >
                  <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
                    {occ.time ? formatTime(occ.time, use24Hour) : "all-day"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {occ.event.title}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

export function UpNext({
  today,
  nextDate,
  todayEvents,
  nextDayEvents,
  calendars,
  tasks,
  use24Hour,
}: {
  today: string
  nextDate: string
  todayEvents: EventOccurrence[]
  nextDayEvents: EventOccurrence[]
  calendars: Calendar[]
  tasks: TasksLite
  use24Hour: boolean
}) {
  // With events on either day, show the two-day agenda.
  if (todayEvents.length + nextDayEvents.length > 0) {
    return (
      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-brand-accent font-mono text-[0.7rem] font-medium tracking-widest uppercase">
            Up next
          </p>
          <Link
            href="/calendar"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium transition-colors"
          >
            Calendar
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <div className="flex flex-col gap-4">
          <DayGroup
            label="Today"
            date={today}
            events={todayEvents}
            calendars={calendars}
            use24Hour={use24Hour}
          />
          <div className="border-border/60 border-t pt-4">
            <DayGroup
              label="Tomorrow"
              date={nextDate}
              events={nextDayEvents}
              calendars={calendars}
              use24Hour={use24Hour}
            />
          </div>
        </div>
      </Panel>
    )
  }

  // No events across both days — surface pending tasks, else an all-clear note.
  const pending = tasks.overdueCount + tasks.dueTodayCount
  if (pending > 0) {
    return (
      <Hero
        href="/todos"
        icon={<ListTodo className="size-5" />}
        title={`${pending} ${pending === 1 ? "task needs" : "tasks need"} attention`}
        subtitle={
          tasks.overdueCount > 0
            ? `${tasks.overdueCount} overdue · ${tasks.dueTodayCount} due today`
            : `${tasks.dueTodayCount} due today`
        }
        cta="To-dos"
      />
    )
  }

  return (
    <Hero
      href="/calendar"
      icon={<Sparkles className="size-5" />}
      title="You're all caught up"
      subtitle="Nothing scheduled today or tomorrow — enjoy the clear runway."
      cta="Plan ahead"
    />
  )
}
