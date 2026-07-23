import Link from "next/link"
import { ArrowRight, CalendarClock, ListTodo, Sparkles } from "lucide-react"

import { formatTime } from "@/lib/format"
import type { EventOccurrence } from "@/modules/calendar/queries"

type TasksLite = { overdueCount: number; dueTodayCount: number }

function formatDay(date: string, today: string): string {
  if (date === today) return "Today"
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function Hero({
  href,
  eyebrow,
  icon,
  title,
  subtitle,
  cta,
}: {
  href: string
  eyebrow: string
  icon: React.ReactNode
  title: string
  subtitle: string
  cta: string
}) {
  return (
    <Link href={href} className="group block">
      <div className="from-primary/10 relative overflow-hidden rounded-xl bg-gradient-to-br to-transparent p-5 shadow-sm ring-1 ring-foreground/10">
        <div className="flex items-start gap-4">
          <span className="bg-brand-accent/15 text-brand-accent flex size-11 shrink-0 items-center justify-center rounded-xl">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-brand-accent font-mono text-[0.7rem] font-medium tracking-widest uppercase">
              {eyebrow}
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
      </div>
    </Link>
  )
}

export function UpNext({
  nextEvent,
  tasks,
  today,
  use24Hour,
}: {
  nextEvent: EventOccurrence | null
  tasks: TasksLite
  today: string
  use24Hour: boolean
}) {
  if (nextEvent) {
    const time = nextEvent.time ? formatTime(nextEvent.time, use24Hour) : null
    const when =
      nextEvent.date === today
        ? (time ?? "All day")
        : `${formatDay(nextEvent.date, today)}${time ? ` · ${time}` : ""}`
    return (
      <Hero
        href="/calendar"
        eyebrow="Up next"
        icon={<CalendarClock className="size-5" />}
        title={nextEvent.event.title}
        subtitle={nextEvent.event.notes ? `${when} · ${nextEvent.event.notes}` : when}
        cta="Calendar"
      />
    )
  }

  const pending = tasks.overdueCount + tasks.dueTodayCount
  if (pending > 0) {
    return (
      <Hero
        href="/todos"
        eyebrow="Up next"
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
      eyebrow="Up next"
      icon={<Sparkles className="size-5" />}
      title="You're all caught up"
      subtitle="Nothing scheduled and nothing due — enjoy the clear runway."
      cta="Plan ahead"
    />
  )
}
