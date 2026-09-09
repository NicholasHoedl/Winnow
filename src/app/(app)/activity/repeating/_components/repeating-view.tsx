"use client"

import * as React from "react"
import { Repeat, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteTaskRecurrence } from "@/modules/todos/actions"
import type { TaskSeries } from "@/modules/todos/queries"
import { repeatLabel } from "@/modules/todos/service"
import { ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

import { ActivityHeader } from "../../_components/activity-header"

/**
 * Every repeating task, listed from the RULES rather than from their generated instances,
 * as a page of the Activity section.
 *
 * This was `RecurrenceManager`, a dialog behind the ⋮ menu on `/activity`, and the reason
 * it lists rules is unchanged: both other ways to reach a rule — "Stop repeating" and the
 * series editor — hang off a materialized task row, so a rule with no current instance
 * (a start date still to come, or a skipped cycle) could not be managed at all. For a
 * monthly rule that meant waiting a month to stop it.
 *
 * Editing is deliberately left to the task row's "Series" scope — that dialog already
 * handles the full recurrence form. This page makes a rule reachable, and stopping it is
 * the thing you cannot otherwise do. ADR-0020 says why it is a destination now.
 */
export function RepeatingView({ rules }: { rules: TaskSeries[] }) {
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
    <div className="mx-auto w-full max-w-5xl p-6">
      <ActivityHeader description="Which days, not how often — a repeating task lands on the dates you set and goes overdue if you miss one. For a rate you keep, three runs a week on any three days, make a habit instead. Every repeating task is listed here, including ones with nothing due right now; stopping one keeps the instances you completed." />

      <ul className="flex max-w-xl flex-col gap-1">
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
    </div>
  )
}
