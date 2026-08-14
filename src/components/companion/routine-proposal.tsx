"use client"

import * as React from "react"
import { ListTodo, Repeat } from "lucide-react"

import { cn } from "@/lib/utils"
import { offsetLabel, routineSpan } from "@/modules/companion/service"
import type { RoutinePayload } from "@/modules/companion/validation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

/**
 * The routine renderer.
 *
 * Same spine as the plan, and deliberately so — but the nodes are **offsets from the day
 * you run it**, not calendar dates, because a routine has no dates until it is run. That
 * is why the plan's date warnings have no counterpart here: there is no deadline for
 * anything to be late against, so inventing a warning would be inventing a judgment.
 *
 * The offsets are still what a model gets wrong, though, so they are rendered in words
 * ("3 days before", "On the day") rather than as raw integers. `-7` on a row makes the
 * reader do the arithmetic; "7 days before" does not.
 */
export function RoutineProposal({
  payload,
  onChange,
  pending,
  onApply,
  onDiscard,
}: {
  payload: RoutinePayload
  onChange: (next: RoutinePayload) => void
  pending: boolean
  onApply: (finalized: RoutinePayload) => void
  onDiscard: () => void
}) {
  const [excluded, setExcluded] = React.useState<Set<number>>(new Set())

  const final: RoutinePayload = {
    ...payload,
    items: payload.items.filter((_, i) => !excluded.has(i)),
  }

  function toggle(index: number) {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function editItem(index: number, title: string) {
    onChange({
      ...payload,
      items: payload.items.map((item, i) =>
        i === index ? { ...item, title } : item,
      ),
    })
  }

  return (
    <div className="bg-card flex flex-col overflow-hidden rounded-xl border lg:min-h-0">
      <div className="border-b p-4">
        <p className="text-brand-accent text-xs font-medium">
          Proposed routine
        </p>
        <Input
          value={payload.name}
          aria-label="Routine name"
          onChange={(event) =>
            onChange({ ...payload, name: event.target.value })
          }
          className="mt-1 h-auto border-0 bg-transparent p-0 !text-base font-medium shadow-none focus-visible:ring-0"
        />
        {payload.description && (
          <p className="text-muted-foreground mt-1 text-xs">
            {payload.description}
          </p>
        )}
      </div>

      <div className="max-h-[55svh] overflow-y-auto p-4 lg:max-h-none lg:min-h-0 lg:flex-1">
        <ol className="border-border ml-1.5 flex flex-col gap-3 border-l-2 pl-5">
          {payload.items.map((item, index) => {
            const off = excluded.has(index)
            return (
              <li key={index} className="relative">
                <span
                  className={cn(
                    "border-card absolute top-1.5 -left-[27px] size-3 rounded-full border-2",
                    off ? "bg-muted-foreground/40" : "bg-primary",
                  )}
                />
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!off}
                    aria-label={`Include ${item.title}`}
                    onCheckedChange={() => toggle(index)}
                    className="shrink-0"
                  />
                  <ListTodo className="text-muted-foreground size-3.5 shrink-0" />
                  <input
                    value={item.title}
                    aria-label={`Item ${index + 1} title`}
                    disabled={off}
                    onChange={(event) => editItem(index, event.target.value)}
                    className={cn(
                      "hover:bg-muted focus:bg-muted focus:ring-ring -mx-1 min-w-0 flex-1 truncate rounded px-1 outline-none focus:ring-1",
                      off && "pointer-events-none line-through opacity-60",
                    )}
                  />
                  <span
                    className={cn(
                      "text-muted-foreground shrink-0 font-mono text-xs",
                      off && "opacity-60",
                    )}
                  >
                    {offsetLabel(item.dueOffsetDays)}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="bg-muted/40 flex items-center justify-between gap-3 border-t p-3">
        <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <Repeat className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            Creates a routine of{" "}
            <span className="text-foreground font-mono">
              {final.items.length}
            </span>{" "}
            task{final.items.length === 1 ? "" : "s"}
            {final.items.length > 0 && ` · ${routineSpan(final)}`}
          </span>
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
            disabled={pending || final.items.length === 0}
          >
            {pending ? "Applying…" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  )
}
