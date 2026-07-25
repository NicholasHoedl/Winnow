"use client"

import { cn } from "@/lib/utils"

/** A small inline choice control for 2–3 short options — the settings pages' stand-in
 * for a radio group (week start, time format, priority, on/off). */
export function Segmented<T extends string | number | boolean>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: readonly { value: T; label: string }[]
}) {
  return (
    <div className="bg-muted inline-flex rounded-lg p-0.5">
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
