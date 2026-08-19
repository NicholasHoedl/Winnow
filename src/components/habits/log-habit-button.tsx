"use client"

import * as React from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/**
 * The `+ Log` button, for both kinds of habit.
 *
 * One component rather than the four near-identical `<Button>` blocks it replaces — the
 * same consolidation `useLogHabit` made for the handler, and for the same reason: the
 * habits page, the `/activity` strip, the dashboard's practice card and the goal detail
 * dialog all offer this action, and a fifth surface should not have to rediscover what it
 * looks like. The hook still owns the WRITE and its undo; this owns the ASKING.
 *
 * **A session habit's button is unchanged, down to the markup.** Tapping it logs one
 * session, because one session is the whole of what it can mean — there is nothing to ask.
 * A measured habit's cannot work that way: "20 words a day" is not a thing you tap, and a
 * `+1` against it would log one word and call the day 5% done. So it opens a small prompt
 * instead, which is the change the measured variant actually needed and the reason turning
 * on two schema columns was never a one-field job.
 *
 * The prompt is a popover rather than an inline field, and that is a phone decision: the
 * narrowest surface drawing this is a 192px chip in a horizontally scrolling strip, and
 * an inline number input there would either not fit or force a second presentation for
 * small screens. One control at every width is what stopped habits being desktop-only in
 * the first place (T12d).
 *
 * `aria-label` stays exactly `Log {title}` in both branches. Four e2e specs address this
 * button by that name and it is the only handle they have.
 */
export function LogHabitButton({
  title,
  unit,
  pending,
  onLog,
  size,
  className,
}: {
  title: string
  /**
   * The unit this habit is measured in, or null for a session habit — read off the
   * `Adherence` the surface already has, never re-derived from the habit row.
   */
  unit: string | null
  /** This habit's write is in flight. Only ever this one — see `useLogHabit`. */
  pending: boolean
  /** Called with an amount for a measured habit, and with nothing for a session. */
  onLog: (amount?: number) => void
  size?: "sm"
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState("")
  const fieldId = React.useId()

  const amount = Number(value)
  // `Number("")` is 0 and `Number(" ")` is 0, so the emptiness test has to come first or
  // an untouched field reads as a valid zero.
  const valid = value.trim() !== "" && Number.isFinite(amount) && amount > 0

  function submit() {
    if (!valid) return
    setOpen(false)
    setValue("")
    onLog(amount)
  }

  if (unit === null) {
    return (
      <Button
        variant="outline"
        size={size}
        disabled={pending}
        aria-label={`Log ${title}`}
        className={className}
        onClick={() => onLog()}
      >
        <Plus className={size === "sm" ? "size-3.5" : "size-4"} />
        Log
      </Button>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Cleared on close rather than on open, so a half-typed amount does not reappear
        // the next time the prompt is opened for the same habit.
        if (!next) setValue("")
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size={size}
            disabled={pending}
            aria-label={`Log ${title}`}
            className={className}
          />
        }
      >
        <Plus className={size === "sm" ? "size-3.5" : "size-4"} />
        Log
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        {/* A form, so Enter submits — the whole point of a prompt you open, type one
            number into, and dismiss. Without it the only way out is the mouse. */}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Label htmlFor={fieldId} className="text-sm">
            How many {unit}?
          </Label>
          <div className="mt-2 flex items-center gap-2">
            <Input
              id={fieldId}
              // `type="number"` for the desktop spinner, `inputMode="decimal"` for the
              // phone keypad — and decimal rather than numeric because 5.5 km is a normal
              // thing to log and `numeric` hides the point on iOS.
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={!valid}>
              Log
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
