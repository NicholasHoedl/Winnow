"use client"

import type { MacroProgressSet } from "@/modules/meals/service"
import { Progress } from "@/components/ui/progress"

const MACROS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
] as const

export function MacroSummary({ progress }: { progress: MacroProgressSet }) {
  return (
    <div className="grid grid-cols-2 gap-4 rounded-xl border p-4 sm:grid-cols-4">
      {MACROS.map(({ key, label, unit }) => {
        const macro = progress[key]
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-xs">{label}</span>
              {macro.percent != null && (
                <span className="text-muted-foreground text-[0.65rem] tabular-nums">
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
              <span className="text-muted-foreground text-xs font-normal"> {unit}</span>
            </div>
            {macro.percent != null ? (
              <Progress value={Math.min(macro.percent, 100)} />
            ) : (
              <div className="bg-muted h-1 rounded-full" />
            )}
          </div>
        )
      })}
    </div>
  )
}
