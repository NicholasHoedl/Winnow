"use client"

import * as React from "react"
import { toast } from "sonner"

import { isValidDateString } from "@/lib/date"
import { runRoutine, undoRoutineRun } from "@/modules/routines/actions"
import type { RoutineWithItems } from "@/modules/routines/queries"
import { previewRun } from "@/modules/routines/service"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

function formatDue(date: string | null): string {
  if (!date) return "No due date"
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

/**
 * Pick the anchor date, see exactly what will be created, then create it.
 *
 * This IS the confirmation step — a separate yes/no `ConfirmDialog` on top would say
 * strictly less than the list already shown here. The preview comes from the same
 * `previewRun` the action uses, so it cannot promise something different from what lands.
 */
export function RunRoutineDialog({
  routine,
  today,
  open,
  onOpenChange,
}: {
  routine: RoutineWithItems
  today: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [anchorDate, setAnchorDate] = React.useState(today)
  const [pending, startTransition] = React.useTransition()

  // Re-seed the anchor whenever the dialog (re)opens, during render rather than in an
  // effect: a setState in an effect here commits the stale date first and then cascades a
  // second render to correct it. Same `openKeyRef` shape as task-dialog and event-dialog.
  const openKeyRef = React.useRef<string | null>(null)
  const openKey = open ? `${routine.id}:${today}` : null
  if (openKey !== openKeyRef.current) {
    openKeyRef.current = openKey
    if (openKey !== null) setAnchorDate(today)
  }

  const valid = isValidDateString(anchorDate)
  // Falling back to today keeps the preview rendering while the date input is mid-edit;
  // the run itself is blocked on `valid`, so nothing can be created from the fallback.
  const planned = previewRun(routine.items, valid ? anchorDate : today)

  function run() {
    startTransition(async () => {
      const result = await runRoutine(routine.id, { anchorDate })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const { taskIds, count } = result
      onOpenChange(false)
      toast.success(`Added ${count} ${count === 1 ? "task" : "tasks"}`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undone = await undoRoutineRun(taskIds)
              if (!undone.ok) toast.error(undone.error)
            }),
        },
      })
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run {routine.name}</DialogTitle>
          <DialogDescription>
            Every offset is counted from this date.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="run-anchor">Starting</FieldLabel>
          <Input
            id="run-anchor"
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
          />
        </Field>

        <div className="mt-4">
          <p className="text-muted-foreground mb-2 text-sm">
            {planned.length === 1
              ? "This will create 1 task:"
              : `This will create ${planned.length} tasks:`}
          </p>
          <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
            {planned.map((task, i) => (
              <li
                key={`${task.title}-${i}`}
                className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">{task.title}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {formatDue(task.dueDate)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="mt-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={run} disabled={pending || !valid}>
            {pending
              ? "Adding…"
              : `Create ${planned.length} ${planned.length === 1 ? "task" : "tasks"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
