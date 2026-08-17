"use client"

import * as React from "react"
import { Droplet, X } from "lucide-react"
import { toast } from "sonner"

import {
  deleteBodyWeight,
  deleteWaterLog,
  logWater,
  restoreWaterLog,
  setBodyWeight,
} from "@/modules/meals/actions"
import type { BodyWeight, WaterLog } from "@/modules/meals/queries"
import {
  fromDisplayVolume,
  fromDisplayWeight,
  toDisplayVolume,
  toDisplayWeight,
  volumePresets,
  volumeUnitLabel,
  weightUnitLabel,
} from "@/lib/format"
import { usePreferences } from "@/components/preferences/preferences-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// `PRESETS_FL_OZ` lived here and was imperial "by decision — see the T4 plan". It is
// `volumePresets(unit)` now: a glass, a large glass and a bottle, expressed as round numbers
// in whichever unit is being displayed rather than as the 236.6/354.9/473.2 that converting
// the imperial three would produce. A preset exists to be tapped without thinking.

/** 48 reads better than 48.0, but 12.5 must keep its half. */
function num(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(1)))
}

function WaterCard({ date, logs }: { date: string; logs: WaterLog[] }) {
  const [pending, startTransition] = React.useTransition()
  const { volumeUnit } = usePreferences()
  const unitLabel = volumeUnitLabel(volumeUnit)
  // Summed in STORAGE units and converted once, not converted per row and then summed —
  // the second rounds every log before adding them up.
  const total = toDisplayVolume(
    logs.reduce((sum, log) => sum + log.amountFlOz, 0),
    volumeUnit,
  )

  /** Takes a DISPLAYED amount and converts on the way in; storage stays fl oz. */
  function add(displayed: number) {
    const amountFlOz = fromDisplayVolume(displayed, volumeUnit)
    startTransition(async () => {
      const result = await logWater({ date, amountFlOz })
      if (!result.ok) toast.error(result.error)
    })
  }

  function remove(log: WaterLog) {
    startTransition(async () => {
      const result = await deleteWaterLog(log.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      // The row the server actually deleted, so undo restores its original id and
      // createdAt rather than a fresh log that merely has the same amount.
      const restorable = result.log ?? log
      toast("Water removed", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undo = await restoreWaterLog(restorable)
              if (!undo.ok) toast.error(undo.error)
            }),
        },
      })
    })
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Droplet aria-hidden className="size-3.5" />
          Water
        </span>
        {/* The presets are buttons whose only visible effect is this number changing,
            so without a live region a screen reader gets no confirmation that a tap
            did anything at all. */}
        <span aria-live="polite" className="text-lg font-semibold tabular-nums">
          {num(total)}
          <span className="text-muted-foreground text-xs font-normal">
            {" "}
            {unitLabel}
          </span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {volumePresets(volumeUnit).map((amount) => (
          <Button
            key={amount}
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => add(amount)}
          >
            +{amount} {unitLabel}
          </Button>
        ))}
      </div>

      {logs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
          {logs.map((log) => (
            <button
              key={log.id}
              type="button"
              disabled={pending}
              onClick={() => remove(log)}
              // Every log is individually removable rather than only the most recent:
              // water_logs is a row per tap precisely so a mis-tap is one plain delete.
              aria-label={`Remove ${num(toDisplayVolume(log.amountFlOz, volumeUnit))} ${unitLabel}`}
              className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums transition-colors disabled:opacity-50"
            >
              {num(toDisplayVolume(log.amountFlOz, volumeUnit))}
              <X aria-hidden className="size-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function WeightCard({
  date,
  weight,
}: {
  date: string
  weight: BodyWeight | null
}) {
  const [pending, startTransition] = React.useTransition()
  const { weightUnit } = usePreferences()
  // Seeded from the day's row, in the DISPLAYED unit. The parent keys this component by
  // date, so moving to another day remounts it — without that the input would keep showing
  // the previous day's weight, which `unique(user_id, date)` would then happily overwrite.
  const [value, setValue] = React.useState(
    weight ? num(toDisplayWeight(weight.weightLb, weightUnit)) : "",
  )

  function save(event: React.FormEvent) {
    event.preventDefault()
    const entered = Number(value.trim())
    if (!value.trim() || Number.isNaN(entered)) {
      toast.error(`Enter a weight in ${weightUnitLabel(weightUnit)}.`)
      return
    }
    // Converted back on the way in — the exact inverse of the seed above, so the stored
    // column stays pounds whatever the account is displaying.
    const weightLb = fromDisplayWeight(entered, weightUnit)
    startTransition(async () => {
      const result = await setBodyWeight({ date, weightLb })
      if (!result.ok) {
        // Field errors are the ranges from bodyWeightSchema — a fat-fingered 1855
        // says so rather than silently flattening the trend chart forever.
        toast.error(result.fieldErrors?.weightLb ?? result.error)
        return
      }
      toast.success("Weight saved")
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteBodyWeight(date)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setValue("")
      toast("Weight removed")
    })
  }

  return (
    <form onSubmit={save} className="rounded-xl border p-4">
      <div className="flex items-baseline justify-between">
        <label htmlFor="body-weight" className="text-muted-foreground text-xs">
          Weight
        </label>
        {weight && (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="text-muted-foreground hover:text-destructive text-xs disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Input
          id="body-weight"
          type="number"
          step="0.1"
          inputMode="decimal"
          placeholder="—"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="tabular-nums"
        />
        <span className="text-muted-foreground text-xs">
          {weightUnitLabel(weightUnit)}
        </span>
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
      </div>
    </form>
  )
}

/**
 * The day's water and weigh-in, under the macro summary.
 *
 * Two cards rather than one because the underlying shapes differ and the UI should
 * show that: water accumulates in taps (many rows, each removable), weight is measured
 * once (one row per day, editable).
 */
export function DayExtras({
  date,
  waterLogs,
  weight,
}: {
  date: string
  waterLogs: WaterLog[]
  weight: BodyWeight | null
}) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <WaterCard date={date} logs={waterLogs} />
      <WeightCard key={date} date={date} weight={weight} />
    </div>
  )
}
