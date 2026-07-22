"use client"

import * as React from "react"
import { MoreVertical, Pencil, Plus, Target, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  addMilestone,
  deleteGoal,
  deleteMilestone,
  toggleMilestone,
} from "@/modules/calendar/actions"
import type { GoalRow, GoalWithProgress } from "@/modules/calendar/queries"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

import { GoalDialog } from "./goal-dialog"

function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function GoalCard({
  goal,
  onEdit,
}: {
  goal: GoalWithProgress
  onEdit: (goal: GoalRow) => void
}) {
  const [newMilestone, setNewMilestone] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok && result.error) toast.error(result.error)
    })
  }

  function addOne() {
    const title = newMilestone.trim()
    if (!title) return
    setNewMilestone("")
    run(() => addMilestone(goal.id, { title }))
  }

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{goal.title}</h3>
          {goal.targetDate && (
            <p className="text-muted-foreground text-xs">
              Target {formatDate(goal.targetDate)}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Goal actions" />
            }
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(goal)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => run(() => deleteGoal(goal.id))}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {goal.notes && (
        <p className="text-muted-foreground text-sm">{goal.notes}</p>
      )}

      <div className="flex items-center gap-2">
        <Progress value={goal.progress.percent} className="flex-1" />
        <span className="text-muted-foreground text-xs tabular-nums">
          {goal.progress.done}/{goal.progress.total}
        </span>
      </div>

      {goal.milestones.length > 0 && (
        <ul className="flex flex-col gap-1">
          {goal.milestones.map((milestone) => (
            <li key={milestone.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={milestone.done}
                onCheckedChange={(checked) =>
                  run(() => toggleMilestone(milestone.id, checked === true))
                }
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  milestone.done && "text-muted-foreground line-through",
                )}
              >
                {milestone.title}
              </span>
              <button
                type="button"
                aria-label={`Delete ${milestone.title}`}
                onClick={() => run(() => deleteMilestone(milestone.id))}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={newMilestone}
          onChange={(e) => setNewMilestone(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addOne()
            }
          }}
          placeholder="Add a milestone"
          className="h-8"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addOne}
          disabled={pending}
        >
          Add
        </Button>
      </div>
    </div>
  )
}

export function GoalsPanel({ goals }: { goals: GoalWithProgress[] }) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingGoal, setEditingGoal] = React.useState<GoalRow | null>(null)

  function openCreate() {
    setEditingGoal(null)
    setDialogOpen(true)
  }

  function openEdit(goal: GoalRow) {
    setEditingGoal(goal)
    setDialogOpen(true)
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display flex items-center gap-2 text-xl font-semibold">
          <Target className="size-5" />
          Goals
        </h2>
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          Add goal
        </Button>
      </div>

      {goals.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          No goals yet. Add a long-term goal and break it into milestones.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onEdit={openEdit} />
          ))}
        </div>
      )}

      <GoalDialog
        goal={editingGoal}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </section>
  )
}
