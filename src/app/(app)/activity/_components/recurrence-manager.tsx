"use client"

import * as React from "react"
import { Repeat, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteTaskRecurrence } from "@/modules/todos/actions"
import type { TaskSeries } from "@/modules/todos/queries"
import { repeatLabel } from "@/modules/todos/service"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Every repeating task, listed from the RULES rather than from their generated instances.
 *
 * Before this, both ways to reach a rule — "Stop repeating" and the series editor — hung
 * off a materialized task row, so a rule without a current instance couldn't be managed at
 * all. Two ways to get there: a rule whose start date hasn't arrived yet (pre-existing),
 * and skipping the current cycle (T5a-S5), which removes the only row there was. For a
 * monthly rule that meant waiting a month to stop it.
 *
 * Editing is deliberately left to the task row's "Series" scope — that dialog already
 * exists and handles the full recurrence form. This one only needs to make a rule
 * reachable, and stopping it is the thing you can't otherwise do.
 */
export function RecurrenceManager({
  rules,
  open,
  onOpenChange,
}: {
  rules: TaskSeries[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [confirming, setConfirming] = React.useState<TaskSeries | null>(null)
  const [pending, startTransition] = React.useTransition()

  function stop(rule: TaskSeries) {
    startTransition(async () => {
      const result = await deleteTaskRecurrence(rule.id)
      if (!result.ok) toast.error(result.error)
      else toast("Stopped repeating")
      setConfirming(null)
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Repeating tasks</DialogTitle>
            <DialogDescription>
              Every repeating task, including ones with nothing due right now.
              Stopping one keeps the instances you already completed.
            </DialogDescription>
          </DialogHeader>

          <ul className="flex flex-col gap-1">
            {rules.length === 0 ? (
              <li className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
                Nothing repeats yet. Turn on Repeat when creating a task.
              </li>
            ) : (
              rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Repeat className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="min-w-0 truncate">{rule.title}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {repeatLabel(rule)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      aria-label={`Stop repeating ${rule.title}`}
                      onClick={() => setConfirming(rule)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Stopping drops every upcoming occurrence, so it confirms — the same bar the
          task row's "Stop repeating" uses. */}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(next) => !next && setConfirming(null)}
        title="Stop repeating?"
        description={
          confirming
            ? `"${confirming.title}" will stop generating new tasks. Completed ones are kept.`
            : ""
        }
        confirmLabel="Stop repeating"
        onConfirm={() => confirming && stop(confirming)}
      />
    </>
  )
}
