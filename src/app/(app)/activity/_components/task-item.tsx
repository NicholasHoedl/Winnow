"use client"

import * as React from "react"
import {
  CalendarOff,
  ChevronDown,
  ChevronRight,
  ListChecks,
  MoreVertical,
  Pencil,
  Repeat,
  Trash2,
} from "lucide-react"
import { dueStatus } from "@/lib/date"

import { cn } from "@/lib/utils"

import type { TaskWithSeries } from "@/modules/todos/queries"
import { repeatLabel } from "@/modules/todos/service"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

import { SubtaskList } from "./subtask-list"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function formatDue(dueDate: string): string {
  const [year, month, day] = dueDate.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function TaskItem({
  task,
  timeZone,
  onToggle,
  onEdit,
  onDelete,
  onSkip,
}: {
  task: TaskWithSeries
  timeZone: string
  onToggle: (id: string) => void
  onEdit: (task: TaskWithSeries) => void
  onDelete: (task: TaskWithSeries) => void
  /** Skip just this cycle. Only offered for a generated instance. */
  onSkip: (task: TaskWithSeries) => void
}) {
  const done = task.status === "done"
  const status = dueStatus(task.dueDate, new Date(), timeZone)
  const series = task.series
  const flexible = !!series?.flexible

  const subtasks = task.subtasks
  const doneCount = subtasks.filter((sub) => sub.done).length
  // Open by default when there's something to see; the toggle is for getting it out of
  // the way, not for discovering it.
  const [expanded, setExpanded] = React.useState(subtasks.length > 0)

  return (
    <div className="bg-card rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={done}
          onCheckedChange={() => onToggle(task.id)}
          aria-label={done ? "Mark as open" : "Mark as done"}
        />

        <button
          type="button"
          onClick={() => onEdit(task)}
          className="min-w-0 flex-1 text-left"
        >
          <span
            className={cn(
              "block truncate text-sm",
              done && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
          {/* `subtasks.length` belongs in this gate: a quick-added task has no due date,
              default priority and no series, so without it the whole badge row — and with
              it the checklist count — never rendered at all. */}
          {(task.dueDate ||
            task.priority !== "medium" ||
            series ||
            subtasks.length > 0) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {flexible && series ? (
                // Flexible: show the period, not a specific date or "overdue".
                <Badge
                  variant="outline"
                  className="inline-flex items-center gap-1 text-xs font-normal"
                >
                  <Repeat className="size-3" />
                  {series.freq === "weekly" ? "This week" : "This month"}
                </Badge>
              ) : (
                <>
                  {task.dueDate && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs font-normal",
                        status === "overdue" &&
                          "bg-destructive/10 text-destructive border-transparent",
                        status === "due-today" &&
                          "bg-primary/10 text-primary border-transparent",
                      )}
                    >
                      {status === "overdue"
                        ? "Overdue"
                        : status === "due-today"
                          ? "Due today"
                          : formatDue(task.dueDate)}
                    </Badge>
                  )}
                  {series && (
                    <Badge
                      variant="outline"
                      className="inline-flex items-center gap-1 text-xs font-normal"
                    >
                      <Repeat className="size-3" />
                      {repeatLabel(series)}
                    </Badge>
                  )}
                </>
              )}
              {subtasks.length > 0 && (
                <Badge
                  variant="outline"
                  className="inline-flex items-center gap-1 text-xs font-normal tabular-nums"
                >
                  <ListChecks className="size-3" />
                  {doneCount}/{subtasks.length}
                </Badge>
              )}
              {task.priority !== "medium" && (
                <Badge
                  variant="outline"
                  className="text-xs font-normal capitalize"
                >
                  {task.priority}
                </Badge>
              )}
            </div>
          )}
        </button>

        {subtasks.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Hide subtasks of ${task.title}`
                : `Show subtasks of ${task.title}`
            }
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Task actions"
              />
            }
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(task)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            {/* The entry point for the FIRST subtask. The add-a-subtask input lives
                inside the checklist, and the checklist starts collapsed when there is
                nothing in it — so without this there is no way to open it. */}
            <DropdownMenuItem onClick={() => setExpanded(true)}>
              <ListChecks className="size-4" />
              {subtasks.length > 0 ? "Show subtasks" : "Add a subtask"}
            </DropdownMenuItem>
            {/* Only for a generated instance, and worded so it can't be confused with the
              destructive item below it: this one drops a single cycle, that one ends the
              whole series. Before T5a the menu offered only the latter. */}
            {series && task.occurrenceDate && (
              <DropdownMenuItem onClick={() => onSkip(task)}>
                <CalendarOff className="size-4" />
                Skip this one
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(task)}
            >
              <Trash2 className="size-4" />
              {series ? "Stop repeating" : "Delete"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && <SubtaskList taskId={task.id} subtasks={subtasks} />}
    </div>
  )
}
