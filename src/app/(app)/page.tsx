import Link from "next/link"
import { CalendarDays, ListTodo, Utensils, Wallet } from "lucide-react"

import { auth } from "@/lib/auth"
import { APP_TIME_ZONE } from "@/lib/config"
import { getMacroSummary } from "@/modules/meals/queries"
import { getTaskSummary } from "@/modules/todos/queries"
import { todayInZone } from "@/modules/todos/service"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

// Stub cards go live in their own phases (Budget → P3, Today/Calendar → P4).
const stubCards = [
  { href: "/calendar", title: "Today", icon: CalendarDays, hint: "Your schedule" },
  { href: "/budget", title: "Budget", icon: Wallet, hint: "This month" },
]

const MACRO_ROWS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
] as const

export default async function DashboardPage() {
  const today = todayInZone(new Date(), APP_TIME_ZONE)
  const [session, tasks, macros] = await Promise.all([
    auth(),
    getTaskSummary(APP_TIME_ZONE),
    getMacroSummary(today),
  ])
  const name = session?.user?.name ?? "there"

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Good to see you, {name}
        </h1>
        <p className="text-muted-foreground text-sm">
          Here&apos;s your day at a glance.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Live Tasks card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="size-4" />
              Tasks
            </CardTitle>
            <CardDescription>Due today &amp; overdue</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-24 flex-col gap-3">
            <div className="flex gap-6">
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {tasks.overdueCount}
                </div>
                <div className="text-muted-foreground text-xs">Overdue</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {tasks.dueTodayCount}
                </div>
                <div className="text-muted-foreground text-xs">Due today</div>
              </div>
            </div>
            {tasks.dueToday.length > 0 && (
              <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
                {tasks.dueToday.slice(0, 3).map((task) => (
                  <li key={task.id} className="truncate">
                    • {task.title}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/todos"
              className="text-muted-foreground hover:text-foreground mt-auto text-sm underline-offset-4 hover:underline"
            >
              View all →
            </Link>
          </CardContent>
        </Card>

        {/* Live Macros card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Utensils className="size-4" />
              Macros
            </CardTitle>
            <CardDescription>Today vs. targets</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-24 flex-col gap-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {MACRO_ROWS.map(({ key, label, unit }) => {
                const macro = macros.progress[key]
                return (
                  <div key={key}>
                    <div className="text-lg font-semibold tabular-nums">
                      {Math.round(macro.consumed)}
                      {macro.target != null && (
                        <span className="text-muted-foreground text-xs font-normal">
                          {" "}
                          / {Math.round(macro.target)}
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {label} ({unit})
                    </div>
                  </div>
                )
              })}
            </div>
            <Link
              href="/meals"
              className="text-muted-foreground hover:text-foreground mt-auto text-sm underline-offset-4 hover:underline"
            >
              Open log →
            </Link>
          </CardContent>
        </Card>

        {stubCards.map((card) => (
          <Card key={card.href}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <card.icon className="size-4" />
                {card.title}
              </CardTitle>
              <CardDescription>{card.hint}</CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-24 items-center justify-center">
              <Link
                href={card.href}
                className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
              >
                Coming in a later checkpoint →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
