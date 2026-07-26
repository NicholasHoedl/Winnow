"use client"

import * as React from "react"
import { toast } from "sonner"

import { copyDay, deleteMealEntries } from "@/modules/meals/actions"
import { addDays } from "@/lib/date"
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

/**
 * Copy another day's entries onto the day being viewed.
 *
 * There is no separate confirm step even though the copy is additive: this dialog
 * already states how many entries the target day has and requires an explicit Copy,
 * so an AlertDialog on top of it would be a second click saying the same thing. The
 * undo toast is the real safety net, and it removes exactly the rows that were added.
 */
export function CopyDayDialog({
  date,
  existingCount,
  open,
  onOpenChange,
}: {
  /** The day being viewed — the copy's destination. */
  date: string
  /** How many entries the destination already has, for the warning. */
  existingCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const yesterday = addDays(date, -1)
  const [from, setFrom] = React.useState(yesterday)
  const [pending, startTransition] = React.useTransition()

  // Reset the source day whenever the dialog opens, in the event handler rather than
  // an effect (see food-manager.tsx).
  function handleOpenChange(next: boolean) {
    if (!next) setFrom(yesterday)
    onOpenChange(next)
  }

  function run() {
    startTransition(async () => {
      const result = await copyDay({ from, to: date })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const ids = result.entryIds
      onOpenChange(false)
      toast(
        `Copied ${result.copied} ${result.copied === 1 ? "entry" : "entries"}`,
        {
          action: {
            label: "Undo",
            onClick: () =>
              startTransition(async () => {
                // Deletes exactly what this copy created, so an undo can't take out
                // entries that were already on the day.
                const undone = await deleteMealEntries(ids)
                if (!undone.ok) toast.error(undone.error)
              }),
          },
        },
      )
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy a day</DialogTitle>
          <DialogDescription>
            Everything logged on the day you pick is added to this one, with the
            macros it was logged with.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="copy-from">Copy from</FieldLabel>
          <Input
            id="copy-from"
            type="date"
            max={addDays(date, -1)}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          {existingCount > 0 && (
            <p className="text-muted-foreground text-xs">
              This day already has {existingCount}{" "}
              {existingCount === 1 ? "entry" : "entries"} — the copies are added
              alongside them.
            </p>
          )}
        </Field>

        <DialogFooter className="mt-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending || !from} onClick={run}>
            {pending ? "Copying…" : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
