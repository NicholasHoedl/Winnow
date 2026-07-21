"use client"

import { MoreVertical, Pencil, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { dueStatus } from "@/modules/todos/service"
import type { Task } from "@/modules/todos/queries"
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

export function TaskItem({
  task,
  timeZone,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task
  timeZone: string
  onToggle: (id: string) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}) {
  const done = task.status === "done"
  const status = dueStatus(task.dueDate, new Date(), timeZone)

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
        {(task.dueDate || task.priority !== "medium") && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
