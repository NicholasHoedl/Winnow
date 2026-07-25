"use client"

// Create dialogs mounted once in the app shell so a create-intent can open them over the
// current page — no navigation. For now only tasks create in place (they need just the
// list options); the other kinds' palette commands navigate to their module (T1-S4 scope).

import * as React from "react"

import type { EventOption } from "@/modules/calendar/queries"
import type { GoalOption } from "@/modules/goals/queries"
import type { List } from "@/modules/todos/queries"
import { TaskDialog } from "@/app/(app)/todos/_components/task-dialog"

import { useCreateIntentListener } from "./create-intent"

export function GlobalCreateDialogs({
  lists,
  goals,
  events,
}: {
  lists: List[]
  goals: GoalOption[]
  events: EventOption[]
}) {
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [taskSeed, setTaskSeed] = React.useState<{
    title?: string
    dueDate?: string
  }>({})

  useCreateIntentListener("task", (intent) => {
    // Each open reflects its own intent (seed cleared when there's no text/date).
    setTaskSeed({ title: intent.text, dueDate: intent.date })
    setTaskOpen(true)
  })

  return (
    <TaskDialog
      lists={lists}
      goals={goals}
      events={events}
      open={taskOpen}
      onOpenChange={setTaskOpen}
      initialTitle={taskSeed.title}
      initialDueDate={taskSeed.dueDate}
    />
  )
}
