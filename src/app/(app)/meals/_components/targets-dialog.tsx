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
import { carbsForCalories } from "@/modules/meals/service"
import { macroTargetsSchema } from "@/modules/meals/validation"
import { numberField } from "@/lib/forms"
import { usePreferences } from "@/components/preferences/preferences-provider"
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
import { useDateLocale } from "@/components/preferences/preferences-provider"

type TargetsFormValues = {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  effectiveFrom: string
}

/** "2026-03-01" → "1 Mar 2026". Parsed as UTC, like every other date label here. */
function periodLabel(date: string, locale: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, {
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
  const locale = useDateLocale()
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

  // useWatch rather than watch(): it subscribes to named fields and returns values, so the
  // React Compiler can still handle this component (watch() returns a function it has to
  // bail out on — the remaining warnings elsewhere in the app are all that).
  const startsOn = useWatch({ control, name: "effectiveFrom" })

  const { balanceMacroTargets } = usePreferences()
  const [calories, proteinG, fatG] = useWatch({
    control,
    name: ["calories", "proteinG", "fatG"],
  })

  /**
   * What carbs will be once this is saved, when the balance preference is on.
   *
   * Only ever a PREVIEW. The carbs input below is deliberately left unregistered while
   * balancing applies, so this component cannot author the submitted value — `setMacroTargets`
   * derives it server-side from the other three. That is what makes the two impossible to
   * disagree: if the preference is switched off in another tab between this page loading and
   * this form submitting, the worst case is that the stored carbs is saved back unchanged.
   */
  const fit = balanceMacroTargets
    ? carbsForCalories({
        calories: Number(calories) || 0,
        proteinG: Number(proteinG) || 0,
        fatG: Number(fatG) || 0,
      })
    : { kind: "skipped" as const }
  const storedCarbs = targets?.carbsG ?? 0

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
    // Named when the rule changed what was typed. The server is authoritative here, and an
    // authority that acts silently is one you cannot learn.
    toast.success(
      result.derivedCarbsG != null
        ? `Targets saved — carbs set to ${Math.round(result.derivedCarbsG)} g`
        : "Targets saved",
    )
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Daily targets</DialogTitle>
          <DialogDescription>
            Set your daily macro goals. Leave a value at 0 to not track it
            {balanceMacroTargets
              ? " — carbs is worked out from the other three unless one of them is 0."
              : "."}
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
                  : `These targets start on ${periodLabel(startsOn, locale)} — earlier days are unchanged.`}
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
                <FieldLabel htmlFor="t-carb">
                  Carbs (g)
                  {fit.kind !== "skipped" && (
                    <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                      calculated
                    </span>
                  )}
                </FieldLabel>
                {fit.kind === "skipped" ? (
                  <Input
                    id="t-carb"
                    type="number"
                    step="any"
                    {...register("carbsG", numberField)}
                  />
                ) : (
                  /* readOnly, and NOT registered. `disabled` would be worse twice over:
                     react-hook-form's `register({ disabled })` UNSETS the field from the
                     submitted values, so the server would receive no `carbsG` at all and
                     reject the whole form on a control you cannot type in. And leaving it
                     registered would let this component author a derived number, which is
                     exactly what the server is here to be the only source of. */
                  <Input
                    // Keyed on the value, which is not decoration. `Input` wraps Base UI's
                    // `InputPrimitive`, and an input given a `value` but no `onChange` does
                    // not adopt a changing one — React reconciles this branch and the
                    // registered branch into the SAME element, so `readOnly` lands and the
                    // displayed number stays at whatever `reset()` first put there. Keying
                    // on the value remounts it instead. Free here: nobody types in it.
                    key={fit.kind === "fits" ? fit.carbsG : "stored"}
                    id="t-carb"
                    type="number"
                    readOnly
                    aria-describedby="t-carb-note"
                    value={fit.kind === "fits" ? fit.carbsG : storedCarbs}
                  />
                )}
                {fit.kind === "fits" && (
                  <p id="t-carb-note" className="text-muted-foreground text-xs">
                    From your calories, protein and fat, so the grams account
                    for the calories.
                    {fit.carbsG !== storedCarbs && targets != null && (
                      <> Currently {Math.round(storedCarbs)} g.</>
                    )}
                  </p>
                )}
                {fit.kind === "overshoot" && (
                  <p id="t-carb-note" className="text-brand-accent text-xs">
                    Protein and fat alone come to{" "}
                    {Math.round(Number(calories) + fit.byKcal)} kcal — more than
                    the calorie target, so there is nothing left for carbs.
                  </p>
                )}
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
                            : `From ${periodLabel(period.effectiveFrom, locale)}`}
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
