"use client"

import { AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"
import type { PlanWarning } from "@/modules/companion/service"

// The two fields both plan panels are built out of, shared rather than copied.
//
// `PlanProposal` reviews a payload the model produced; `PlanEditor` edits the rows that
// payload became. The semantics of the surrounding panels differ sharply — a checkbox
// means "do not create this" in one and a trash button means "delete this" in the other —
// but a title you can type over and a date you can pick are the same control in both, and
// a second copy is a second place for the focus ring and the warning colours to drift.

/**
 * A title that is always editable but reads as text.
 *
 * No click-to-edit mode: a borderless input that reveals its edges on hover and focus.
 * Fifteen rows with a mode each is fifteen chances to be in the wrong one, and the whole
 * point of this surface is to fix two or three things quickly and move on.
 */
export function EditableTitle({
  value,
  onChange,
  disabled,
  className,
  label,
  autoFocus,
}: {
  value: string
  onChange: (next: string) => void
  disabled: boolean
  className?: string
  label: string
  /** Set on a row that was just added, so typing is the next thing you do. */
  autoFocus?: boolean
}) {
  return (
    <input
      value={value}
      aria-label={label}
      disabled={disabled}
      autoFocus={autoFocus}
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

export function EditableDate({
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
