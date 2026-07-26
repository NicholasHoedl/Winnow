"use client"

import type { MacroProgressSet, MicroTotals } from "@/modules/meals/service"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"

const MACROS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
] as const

const MICROS = [
  { key: "fiber", label: "Fiber", unit: "g" },
  { key: "sugar", label: "Sugar", unit: "g" },
  { key: "satFat", label: "Sat. fat", unit: "g" },
  { key: "sodium", label: "Sodium", unit: "mg" },
] as const

/**
 * The micro row, shown only for micros something actually carried. When only some of
 * the day's entries had a figure it says so — "412 mg (3 of 8)" is a usable number,
 * whereas a bare "412 mg" would imply the whole day was measured.
 */
function MicroRow({ micros }: { micros: MicroTotals }) {
  const present = MICROS.filter(({ key }) => micros.known[key] > 0)
  if (present.length === 0) return null

  return (
    <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs">
      {present.map(({ key, label, unit }) => {
        const known = micros.known[key]
        const partial = known < micros.total
        return (
          <span key={key}>
            {label}{" "}
            <span className="text-foreground font-medium tabular-nums">
              {micros.totals[key]}
              {unit}
            </span>
            {partial && (
              <span className="text-muted-foreground/70">
                {" "}
                ({known} of {micros.total})
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

export function MacroSummary({
  progress,
  micros,
}: {
  progress: MacroProgressSet
  micros: MicroTotals
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {MACROS.map(({ key, label, unit }) => {
          const macro = progress[key]
          const over = macro.percent != null && macro.percent > 100
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground text-xs">{label}</span>
                {macro.percent != null && (
                  <span
                    className={cn(
                      "text-[0.65rem] tabular-nums",
                      over
                        ? "text-destructive font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    {macro.percent}%
                  </span>
                )}
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {Math.round(macro.consumed)}
                {macro.target != null && (
                  <span className="text-muted-foreground text-xs font-normal">
                    {" "}
                    / {Math.round(macro.target)}
                  </span>
                )}
                <span className="text-muted-foreground text-xs font-normal">
                  {" "}
                  {unit}
                </span>
              </div>
              {/* The bar is decorative and aria-hidden ON PURPOSE. Its width has to be
                  clamped at 100% or it overflows its track, but base-ui derives
                  aria-valuenow from the value it's given — so an unhidden bar would
                  announce "100%" for a day that actually hit 127%. The visible
                  percentage above is the uncapped truth, and hiding the bar leaves that
                  as the only thing a screen reader reads. */}
              {macro.percent != null ? (
                <Progress
                  aria-hidden
                  value={Math.min(macro.percent, 100)}
                  indicatorClassName={over ? "bg-destructive" : undefined}
                />
              ) : (
                <div aria-hidden className="bg-muted h-1 rounded-full" />
              )}
            </div>
          )
        })}
      </div>
      <MicroRow micros={micros} />
    </div>
  )
}
