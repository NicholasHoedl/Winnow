"use client"

import { cn } from "@/lib/utils"

/** A small inline choice control for 2–3 short options — the settings pages' stand-in
 * for a radio group (week start, time format, priority, on/off). */
export function Segmented<T extends string | number | boolean>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: readonly { value: T; label: string }[]
  /**
   * What this control decides — the same words as the `FieldLabel` above it.
   *
   * REQUIRED, and that is the point. This rendered a bare `<div>` of toggle buttons whose
   * only accessible text was the option itself, and the `FieldLabel` sitting directly above
   * was associated with nothing. Two controls in the settings form now offer "1 week" and
   * "2 weeks" — the goal-momentum window and the Slate horizon — so a screen reader
   * announced "1 week, button, pressed" twice with no way to tell which was which, and a
   * test asking for that button got two elements. Naming the group fixes both, and making
   * the prop required is what stops the next one being added without a name.
   */
  label: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="bg-muted inline-flex rounded-lg p-0.5"
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
