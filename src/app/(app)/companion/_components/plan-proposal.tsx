"use client"

import * as React from "react"
import { AlertTriangle, Flag, ListTodo } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  finalizePlan,
  planWarnings,
  type Excluded,
  type PlanWarning,
} from "@/modules/companion/service"
import type { GoalPlanPayload } from "@/modules/companion/validation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

/**
 * A title that is always editable but reads as text.
 *
 * No click-to-edit mode: a borderless input that reveals its edges on hover and focus.
 * Fifteen rows with a mode each is fifteen chances to be in the wrong one, and the whole
 * point of this surface is to fix two or three things quickly and move on.
 */
function EditableTitle({
  value,
  onChange,
  disabled,
  className,
  label,
}: {
  value: string
  onChange: (next: string) => void
  disabled: boolean
  className?: string
  label: string
}) {
  return (
    <input
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "hover:bg-muted focus:bg-muted -mx-1 min-w-0 flex-1 truncate rounded px-1 outline-none",
        "focus:ring-ring focus:ring-1",
        disabled && "pointer-events-none line-through opacity-60",
        className,
      )}
    />
  )
}

function EditableDate({
  value,
  onChange,
  disabled,
  label,
  warning,
}: {
  value: string
  onChange: (next: string) => void
  disabled: boolean
  label: string
  warning?: PlanWarning
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {warning && (
        <AlertTriangle
          className={cn(
            "size-3.5",
            warning.kind === "tight" ? "text-brand-accent" : "text-destructive",
          )}
          aria-hidden
        />
      )}
      <span className="sr-only">{warning?.message}</span>
      <input
        type="date"
        value={value}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "hover:bg-muted focus:bg-muted focus:ring-ring rounded px-1 font-mono text-xs outline-none focus:ring-1",
          disabled && "pointer-events-none opacity-60",
          warning
            ? warning.kind === "tight"
              ? "text-brand-accent"
              : "text-destructive"
            : "text-muted-foreground",
        )}
      />
    </span>
  )
}

/**
 * The proposal renderer: a plan on a time spine.
 *
 * The spine is not decoration. Dates are what a model gets wrong most often, and a form
 * hides distribution completely — three milestones quietly bunched into one week look
 * identical to three spread evenly. On a timeline they don't.
 *
 * Excluded rows stay in place, struck and dimmed, rather than disappearing. Removing them
 * would reshuffle the list under the cursor mid-prune, which is the same reasoning that
 * keeps the linked-task list stable on a goal card.
 */
export function PlanProposal({
  payload,
  onChange,
  goalTitle,
  targetDate,
  today,
  pending,
  onApply,
  onDiscard,
}: {
  payload: GoalPlanPayload
  onChange: (next: GoalPlanPayload) => void
  goalTitle: string
  targetDate: string | null
  today: string
  pending: boolean
  onApply: (finalized: GoalPlanPayload) => void
  onDiscard: () => void
}) {
  const [excluded, setExcluded] = React.useState<{
    milestones: Set<number>
    tasks: Set<number>
  }>({ milestones: new Set(), tasks: new Set() })

  // Recomputed from the CURRENT payload, so fixing a bad date makes its warning vanish
  // as you type. The app judges these dates; the model is never asked to grade itself.
  const warnings = React.useMemo(
    () => planWarnings(payload, { targetDate }, today),
    [payload, targetDate, today],
  )
  const warningFor = (on: "milestone" | "task", index: number) =>
    warnings.find((w) => w.on === on && w.index === index)

  const final = finalizePlan(payload, excluded as Excluded)

  function toggle(on: "milestones" | "tasks", index: number) {
    setExcluded((current) => {
      const next = new Set(current[on])
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return { ...current, [on]: next }
    })
  }

  function editMilestone(
    index: number,
    patch: { title?: string; dueDate?: string },
  ) {
    onChange({
      ...payload,
      milestones: payload.milestones.map((m, i) =>
        i === index ? { ...m, ...patch } : m,
      ),
    })
  }

  function editTask(
    index: number,
    patch: { title?: string; dueDate?: string },
  ) {
    onChange({
      ...payload,
      tasks: payload.tasks.map((t, i) =>
        i === index ? { ...t, ...patch } : t,
      ),
    })
  }

  return (
    <div className="bg-card flex flex-col overflow-hidden rounded-xl border lg:min-h-0">
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <p className="text-brand-accent text-xs font-medium">Proposed plan</p>
          <h2 className="truncate font-medium">{goalTitle}</h2>
        </div>
      </div>

      {/* Capped on a phone so the footer's Apply stays reachable without scrolling past a
          long plan; on desktop it fills whatever the pinned column gives it. */}
      <div className="max-h-[55svh] overflow-y-auto p-4 lg:max-h-none lg:min-h-0 lg:flex-1">
        <ol className="border-border ml-1.5 flex flex-col gap-5 border-l-2 pl-5">
          {payload.milestones.map((milestone, index) => {
            const off = excluded.milestones.has(index)
            const warning = warningFor("milestone", index)
            return (
              <li key={index} className="relative">
                <span
                  className={cn(
                    "border-card absolute top-1.5 -left-[27px] size-3 rounded-full border-2",
                    off
                      ? "bg-muted-foreground/40"
                      : warning && warning.kind !== "tight"
                        ? "bg-destructive"
                        : warning
                          ? "bg-brand-accent"
                          : "bg-primary",
                  )}
                />
                <div className="flex items-baseline gap-2 text-sm">
                  <Checkbox
                    checked={!off}
                    aria-label={`Include ${milestone.title}`}
                    onCheckedChange={() => toggle("milestones", index)}
                    className="shrink-0 self-center"
                  />
                  <Flag className="text-muted-foreground size-3.5 shrink-0 self-center" />
                  <EditableTitle
                    value={milestone.title}
                    disabled={off}
                    label={`Milestone ${index + 1} title`}
                    className="font-medium"
                    onChange={(title) => editMilestone(index, { title })}
                  />
                  <EditableDate
                    value={milestone.dueDate}
                    disabled={off}
                    warning={warning}
                    label={`Milestone ${index + 1} date`}
                    onChange={(dueDate) => editMilestone(index, { dueDate })}
                  />
                </div>
                {warning && !off && (
                  <p
                    className={cn(
                      "mt-1 ml-7 text-xs",
                      warning.kind === "tight"
                        ? "text-brand-accent"
                        : "text-destructive",
                    )}
                  >
                    {warning.message}
                  </p>
                )}

                <ul className="mt-2 ml-7 flex flex-col gap-1.5">
                  {payload.tasks.map((task, taskIndex) =>
                    task.milestoneIndex !== index ? null : (
                      <li
                        key={taskIndex}
                        className="flex items-baseline gap-2 text-sm"
                      >
                        <Checkbox
                          checked={!off && !excluded.tasks.has(taskIndex)}
                          disabled={off}
                          aria-label={`Include ${task.title}`}
                          onCheckedChange={() => toggle("tasks", taskIndex)}
                          className="shrink-0 self-center"
                        />
                        <ListTodo className="text-muted-foreground size-3.5 shrink-0 self-center" />
                        <EditableTitle
                          value={task.title}
                          disabled={off || excluded.tasks.has(taskIndex)}
                          label={`Task ${taskIndex + 1} title`}
                          className="text-muted-foreground"
                          onChange={(title) => editTask(taskIndex, { title })}
                        />
                        <EditableDate
                          value={task.dueDate}
                          disabled={off || excluded.tasks.has(taskIndex)}
                          warning={warningFor("task", taskIndex)}
                          label={`Task ${taskIndex + 1} date`}
                          onChange={(dueDate) =>
                            editTask(taskIndex, { dueDate })
                          }
                        />
                      </li>
                    ),
                  )}
                </ul>
              </li>
            )
          })}
        </ol>
      </div>

      {/* The anti-surprise device: it counts what will actually be created, live, so
          Apply never does more than the number sitting next to it. */}
      <div className="bg-muted/40 flex items-center justify-between gap-3 border-t p-3">
        <p className="text-muted-foreground text-xs">
          Creates{" "}
          <span className="text-foreground font-mono">
            {final.milestones.length}
          </span>{" "}
          milestone{final.milestones.length === 1 ? "" : "s"} and{" "}
          <span className="text-foreground font-mono">
            {final.tasks.length}
          </span>{" "}
          task{final.tasks.length === 1 ? "" : "s"}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDiscard}
            disabled={pending}
          >
            Discard
          </Button>
          <Button
            size="sm"
            onClick={() => onApply(final)}
            disabled={
              pending || final.milestones.length + final.tasks.length === 0
            }
          >
            {pending ? "Applying…" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  )
}
