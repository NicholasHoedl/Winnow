"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { Trash2 } from "lucide-react"

import {
  deleteMacroTargetPeriod,
  restoreMacroTargetPeriod,
  setMacroTargets,
} from "@/modules/meals/actions"
import type { MacroTargets } from "@/modules/meals/queries"
import { macroTargetsSchema } from "@/modules/meals/validation"
import { numberField } from "@/lib/forms"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type TargetsFormValues = {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  effectiveFrom: string
}

/** "2026-03-01" → "1 Mar 2026". Parsed as UTC, like every other date label here. */
function periodLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function TargetsDialog({
  targets,
  history,
  date,
  open,
  onOpenChange,
}: {
  /** The period in effect on the viewed day — what the form starts from. */
  targets: MacroTargets | null
  /** Every period, newest first. */
  history: MacroTargets[]
  /** The day being viewed; new targets start here, not necessarily today. */
  date: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = React.useTransition()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TargetsFormValues>({
    resolver: standardSchemaResolver(macroTargetsSchema),
    defaultValues: {
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      effectiveFrom: date,
    },
  })

  React.useEffect(() => {
    if (open) {
      reset({
        calories: targets?.calories ?? 0,
        proteinG: targets?.proteinG ?? 0,
        carbsG: targets?.carbsG ?? 0,
        fatG: targets?.fatG ?? 0,
        // Defaults to the day being viewed, so changing targets while looking at a past
        // day edits that period rather than silently creating one starting today.
        effectiveFrom: date,
      })
    }
  }, [open, targets, date, reset])

  function removePeriod(period: MacroTargets) {
    startTransition(async () => {
      const result = await deleteMacroTargetPeriod(period.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.period ?? period
      toast("Target period removed", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await restoreMacroTargetPeriod(restorable)
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  // useWatch rather than watch(): it subscribes to the one field and returns a value,
  // so the React Compiler can still handle this component (watch() returns a function
  // it has to bail out on — the four warnings elsewhere in the app are all that).
  const startsOn = useWatch({ control, name: "effectiveFrom" })

  const onSubmit = handleSubmit(async (data) => {
    const result = await setMacroTargets(data)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors)) {
          setError(name as keyof TargetsFormValues, { message })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success("Targets saved")
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Daily targets</DialogTitle>
          <DialogDescription>
            Set your daily macro goals. Leave a value at 0 to not track it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="t-from">Applies from</FieldLabel>
              <Input id="t-from" type="date" {...register("effectiveFrom")} />
              {/* Naming the day matters: a change dated tomorrow leaves today alone,
                  which is correct but not what you'd assume from "Save". */}
              <p className="text-muted-foreground text-xs">
                {startsOn === date
                  ? "Days before this keep their previous targets."
                  : `These targets start on ${periodLabel(startsOn)} — earlier days are unchanged.`}
              </p>
              <FieldError errors={[errors.effectiveFrom]} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="t-cal">Calories</FieldLabel>
                <Input
                  id="t-cal"
                  type="number"
                  step="any"
                  {...register("calories", numberField)}
                />
                <FieldError errors={[errors.calories]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="t-pro">Protein (g)</FieldLabel>
                <Input
                  id="t-pro"
                  type="number"
                  step="any"
                  {...register("proteinG", numberField)}
                />
                <FieldError errors={[errors.proteinG]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="t-carb">Carbs (g)</FieldLabel>
                <Input
                  id="t-carb"
                  type="number"
                  step="any"
                  {...register("carbsG", numberField)}
                />
                <FieldError errors={[errors.carbsG]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="t-fat">Fat (g)</FieldLabel>
                <Input
                  id="t-fat"
                  type="number"
                  step="any"
                  {...register("fatG", numberField)}
                />
                <FieldError errors={[errors.fatG]} />
              </Field>
            </div>

            {history.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-2 text-xs font-medium">
                  Target periods
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {history.map((period) => (
                    <li
                      key={period.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="block font-medium">
                          {/* The backfilled row covers all of history rather than
                              starting on a date anyone chose. */}
                          {period.effectiveFrom === "1970-01-01"
                            ? "From the start"
                            : `From ${periodLabel(period.effectiveFrom)}`}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {Math.round(period.calories)} kcal ·{" "}
                          {Math.round(period.proteinG)}p{" "}
                          {Math.round(period.carbsG)}c {Math.round(period.fatG)}
                          f
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete targets from ${period.effectiveFrom}`}
                        disabled={pending}
                        onClick={() => removePeriod(period)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
