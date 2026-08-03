"use client"

import * as React from "react"
import { dueStatus } from "@/lib/date"
import Link from "next/link"
import { ListTodo } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { toggleTaskStatus } from "@/modules/todos/actions"
import type { TaskWithSeries } from "@/modules/todos/queries"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"

const MAX_SHOWN = 10

function formatDue(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

/**
 * Dashboard "Coming up" card: a checkable list of the open tasks the agenda above it
 * does NOT already show — everything that isn't overdue or due today.
 *
 * It used to be "Tasks" and list all of them, with overdue / due-today tallies. Both had
 * to go when `/today`'s agenda moved onto this page: the agenda pins overdue in its own
 * section and lists today's tasks inline, so a task due today rendered twice on one
 * screen, and the tallies would have described rows this card no longer holds.
 *
 * The caller decides what "already shown" means, from the agenda's own output — see
 * `page.tsx`. Toggling completes a task in place (optimistic).
 */
export function DashboardTaskList({
  tasks,
  timeZone,
}: {
  tasks: TaskWithSeries[]
  timeZone: string
}) {
  const [optimistic, applyOptimistic] = React.useOptimistic<
    TaskWithSeries[],
    string
  >(tasks, (state, toggledId) =>
    state.map((task) =>
      task.id === toggledId
        ? { ...task, status: task.status === "open" ? "done" : "open" }
        : task,
    ),
  )
  const [, startTransition] = React.useTransition()

  function toggle(id: string) {
    startTransition(async () => {
      applyOptimistic(id)
      const result = await toggleTaskStatus(id)
      if (!result.ok) toast.error(result.error)
    })
  }

  const now = new Date()
  // Completed tasks stay in the list (struck through) until the next load, rather than
  // disappearing the moment they're checked.
  const shown = optimistic.slice(0, MAX_SHOWN)

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Coming up</span>
          <Link
            href="/todos"
            className="text-muted-foreground hover:text-foreground text-xs font-medium"
          >
            All →
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {optimistic.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-10 text-center">
            <ListTodo className="size-6 opacity-60" />
            <p className="text-sm">Nothing else on the list.</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-0.5">
            {shown.map((task) => {
              const done = task.status === "done"
              const status = dueStatus(task.dueDate, now, timeZone)
              return (
                <li key={task.id}>
                  <div className="hover:bg-accent flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors">
                    <Checkbox
                      checked={done}
                      onCheckedChange={() => toggle(task.id)}
                      aria-label={
                        done ? `Reopen ${task.title}` : `Complete ${task.title}`
                      }
                    />
                    <Link
                      href="/todos"
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        done && "text-muted-foreground line-through",
                      )}
                    >
                      {task.title}
                    </Link>
                    {!done && task.dueDate && status !== "none" && (
                      <span
                        className={cn(
                          "shrink-0 text-xs tabular-nums",
                          status === "overdue"
                            ? "text-destructive"
                            : status === "due-today"
                              ? "text-primary"
                              : "text-muted-foreground",
                        )}
                      >
                        {status === "overdue"
                          ? "Overdue"
                          : status === "due-today"
                            ? "Today"
                            : formatDue(task.dueDate)}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
            {optimistic.length > MAX_SHOWN && (
              <li className="pt-1 pl-1.5">
                <Link
                  href="/todos"
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  +{optimistic.length - MAX_SHOWN} more
                </Link>
              </li>
            )}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
