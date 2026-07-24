"use client"

import { MoreVertical, Pencil, Repeat, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { dueStatus } from "@/modules/todos/service"
import type { TaskSeries, TaskWithSeries } from "@/modules/todos/queries"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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

const UNIT = { daily: "day", weekly: "week", monthly: "month" } as const

/** "Daily" / "Weekly" / "Every 2 weeks" for a repeat badge. */
function repeatLabel(series: TaskSeries): string {
  const unit = UNIT[series.freq]
  if (series.recurrenceInterval > 1) {
    return `Every ${series.recurrenceInterval} ${unit}s`
  }
  return { daily: "Daily", weekly: "Weekly", monthly: "Monthly" }[series.freq]
}

export function TaskItem({
  task,
  timeZone,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: TaskWithSeries
  timeZone: string
  onToggle: (id: string) => void
  onEdit: (task: TaskWithSeries) => void
  onDelete: (task: TaskWithSeries) => void
}) {
  const done = task.status === "done"
  const status = dueStatus(task.dueDate, new Date(), timeZone)
  const series = task.series
  const flexible = !!series?.flexible

  return (
    <div className="bg-card flex items-center gap-3 rounded-lg border p-3">
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
        {(task.dueDate || task.priority !== "medium" || series) && (
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
                        "border-transparent bg-destructive/10 text-destructive",
                      status === "due-today" &&
                        "border-transparent bg-primary/10 text-primary",
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
            {task.priority !== "medium" && (
              <Badge variant="outline" className="text-xs font-normal capitalize">
                {task.priority}
              </Badge>
            )}
          </div>
        )}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Task actions" />}
        >
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(task)}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(task)}>
            <Trash2 className="size-4" />
            {series ? "Stop repeating" : "Delete"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
