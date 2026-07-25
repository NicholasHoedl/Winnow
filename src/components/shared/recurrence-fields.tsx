"use client"

import {
  Controller,
  type Control,
  type FieldErrors,
  type FieldValues,
  type UseFormRegister,
  type UseFormWatch,
} from "react-hook-form"

import { cn } from "@/lib/utils"
import { numberField } from "@/lib/forms"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * The slice of a form these fields bind to. Any form that renders
 * {@link RecurrenceFields} must carry exactly these names and types — that is what
 * the `T` constraint below enforces, and what makes the casts inside sound.
 *
 * `flexible` is optional: "any day within the week" is meaningful for a chore but
 * not for an auto-posted payment, so the money form omits it entirely rather than
 * carrying a field it never sends.
 */
export type RecurrenceFormValues = {
  repeat: "none" | "daily" | "weekly" | "monthly"
  recurrenceInterval: number
  weekdays: number
  monthlyMode: "day_of_month" | "nth_weekday"
  startDate: string
  endDate?: string
  flexible?: boolean
}

const REPEAT_LABELS = {
  none: "Off",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
} as const

const INTERVAL_UNIT = {
  daily: "days",
  weekly: "weeks",
  monthly: "months",
} as const

const WEEKDAY_TOGGLES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
const ORDINALS = ["first", "second", "third", "fourth", "fifth"]

/** Weekday (0=Sun..6=Sat) of a YYYY-MM-DD, or -1 if unparseable. */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return -1
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Google-style labels for the two monthly modes, derived from the start date. */
function monthlyLabels(date: string): {
  dayOfMonth: string
  nthWeekday: string
} {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d)
    return { dayOfMonth: "the same day", nthWeekday: "the same weekday" }
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const which =
    d + 7 > daysInMonth ? "last" : (ORDINALS[Math.ceil(d / 7) - 1] ?? "last")
  return {
    dayOfMonth: `day ${d}`,
    nthWeekday: `the ${which} ${WEEKDAY_NAMES[dow]}`,
  }
}

/**
 * The "Repeat" section shared by the task dialog and the transaction dialog. Renders
 * only the Repeat select until a frequency is chosen.
 */
export function RecurrenceFields<
  T extends FieldValues & RecurrenceFormValues,
  // Control also carries the form's context and post-resolver output types. These
  // fields touch neither, so both stay free rather than forcing each caller to line
  // them up — a form with a resolver has an output type that isn't its value type.
  TContext,
  TTransformed extends FieldValues | undefined,
>({
  control,
  register,
  watch,
  errors,
  idPrefix,
  showFlexible = true,
}: {
  control: Control<T, TContext, TTransformed>
  register: UseFormRegister<T>
  watch: UseFormWatch<T>
  errors: FieldErrors<T>
  /** Namespaces the DOM ids, so two dialogs carrying these fields can both mount. */
  idPrefix: string
  /** Off for money: an auto-posted bill has no "sometime this week" mode. */
  showFlexible?: boolean
}) {
  // RHF's Control/UseFormRegister/UseFormWatch are invariant in the form type, so a
  // generic wrapper can't index them by a literal field name. Narrowing them once,
  // here, keeps the body plainly typed instead of scattering `as Path<T>` through it —
  // and the `T extends RecurrenceFormValues` constraint above is what makes it sound.
  const c = control as unknown as Control<RecurrenceFormValues>
  const reg = register as unknown as UseFormRegister<RecurrenceFormValues>
  const w = watch as unknown as UseFormWatch<RecurrenceFormValues>
  const err = errors as FieldErrors<RecurrenceFormValues>

  const repeat = w("repeat")
  const startDate = w("startDate")
  const flexible = showFlexible ? w("flexible") : false

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-repeat`}>Repeat</FieldLabel>
        <Controller
          control={c}
          name="repeat"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => value && field.onChange(value)}
            >
              <SelectTrigger id={`${idPrefix}-repeat`} className="w-full">
                <SelectValue>
                  {(value) =>
                    REPEAT_LABELS[value as keyof typeof REPEAT_LABELS]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(REPEAT_LABELS) as (keyof typeof REPEAT_LABELS)[]
                ).map((key) => (
                  <SelectItem key={key} value={key}>
                    {REPEAT_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      {repeat !== "none" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-interval`}>
                Every ({INTERVAL_UNIT[repeat]})
              </FieldLabel>
              <Input
                id={`${idPrefix}-interval`}
                type="number"
                min="1"
                {...reg("recurrenceInterval", numberField)}
              />
              <FieldError errors={[err.recurrenceInterval]} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-start`}>Starts</FieldLabel>
              <Input
                id={`${idPrefix}-start`}
                type="date"
                {...reg("startDate")}
              />
              <FieldError errors={[err.startDate]} />
            </Field>
          </div>

          {showFlexible && repeat !== "daily" && (
            <Controller
              control={c}
              name="flexible"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.value ?? false}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                  Any day within the {repeat === "weekly" ? "week" : "month"}{" "}
                  (once per {repeat === "weekly" ? "week" : "month"})
                </label>
              )}
            />
          )}

          {repeat === "weekly" && !flexible && (
            <Field>
              <FieldLabel>On days</FieldLabel>
              <Controller
                control={c}
                name="weekdays"
                render={({ field }) => {
                  const startWd = weekdayOf(startDate)
                  const mask =
                    field.value === 0 && startWd >= 0
                      ? 1 << startWd
                      : field.value
                  return (
                    <div className="flex flex-wrap gap-1">
                      {WEEKDAY_TOGGLES.map((label, wd) => {
                        const on = (mask & (1 << wd)) !== 0
                        return (
                          <button
                            key={wd}
                            type="button"
                            aria-pressed={on}
                            aria-label={WEEKDAY_NAMES[wd]}
                            onClick={() => field.onChange(mask ^ (1 << wd))}
                            className={cn(
                              "size-9 rounded-md text-xs font-medium transition-colors",
                              on
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  )
                }}
              />
            </Field>
          )}

          {repeat === "monthly" && !flexible && (
            <Field>
              <FieldLabel>On</FieldLabel>
              <Controller
                control={c}
                name="monthlyMode"
                render={({ field }) => {
                  const labels = monthlyLabels(startDate)
                  const options = [
                    {
                      value: "day_of_month" as const,
                      label: labels.dayOfMonth,
                    },
                    { value: "nth_weekday" as const, label: labels.nthWeekday },
                  ]
                  return (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={field.value === option.value}
                          onClick={() => field.onChange(option.value)}
                          className={cn(
                            "flex-1 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                            field.value === option.value
                              ? "border-primary ring-primary/30 ring-2"
                              : "border-border hover:bg-accent",
                          )}
                        >
                          On {option.label}
                        </button>
                      ))}
                    </div>
                  )
                }}
              />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-until`}>
              Until (optional)
            </FieldLabel>
            <Input id={`${idPrefix}-until`} type="date" {...reg("endDate")} />
            <FieldError errors={[err.endDate]} />
          </Field>
        </>
      )}
    </>
  )
}
