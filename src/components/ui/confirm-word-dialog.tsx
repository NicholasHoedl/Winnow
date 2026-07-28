"use client"

import * as React from "react"

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
 * A confirmation that has to be typed out, for the handful of actions that destroy data
 * outright.
 *
 * Deliberately NOT `ConfirmDialog`. That one is a two-button confirm and is the right bar
 * for the app's usual destructive actions — stopping a series, deleting a goal — all of
 * which are recoverable or narrow. This is for the two that are neither: erasing
 * everything, and replacing everything from a file. Making the hand slow down is the
 * whole point, so a misplaced click cannot do it.
 *
 * It existed once already, hand-rolled inside the clear-data section. Import needed the
 * same gate, and a second copy of a safety mechanism is how the two drift until one of
 * them is the weaker.
 */
export function ConfirmWordDialog({
  open,
  onOpenChange,
  title,
  description,
  word = "DELETE",
  confirmLabel,
  pendingLabel,
  pending = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  /** What has to be typed. Uppercase, so it can't be produced by autocomplete. */
  word?: string
  confirmLabel: string
  pendingLabel: string
  pending?: boolean
  onConfirm: () => void
}) {
  const [typed, setTyped] = React.useState("")
  const inputId = React.useId()

  function change(next: boolean) {
    onOpenChange(next)
    // Clear on close so re-opening never arrives pre-armed.
    if (!next) setTyped("")
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={inputId}>Type {word}</FieldLabel>
          <Input
            id={inputId}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />
        </Field>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => change(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={typed !== word || pending}
            onClick={onConfirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
